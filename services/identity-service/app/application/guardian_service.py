from __future__ import annotations

import uuid
from typing import Callable
from uuid import UUID

from app.application.dtos import FirstStudentData, UpdateGuardianProfileData
from app.domain.entities import SUPPORT_CONDITION_NAME_OTHER, Guardian, Person, Student
from app.domain.exceptions import (
    InvalidAvatar,
    InvalidRelationshipType,
    InvalidSupportCondition,
    ResourceNotFound,
)
from app.application.session_service import SessionService
from app.domain.ports import PasswordHasher, UnitOfWork

UowFactory = Callable[[], "UnitOfWork"]


class GuardianService:
    def __init__(
        self,
        uow_factory: UowFactory,
        password_hasher: PasswordHasher,
        sessions: SessionService,
    ) -> None:
        self._uow_factory = uow_factory
        self._hasher = password_hasher
        self._sessions = sessions

    async def list_students(self, person_id: UUID) -> list[Student]:
        async with self._uow_factory() as uow:
            guardian = await uow.guardians.get_by_person_id(person_id)
            if guardian is None:
                raise ResourceNotFound("No existe un tutor asociado a esta cuenta.")
            return await uow.students.list_by_guardian(guardian.id)

    # Creates an additional student profile under the same guardian, for siblings.
    async def create_student(self, person_id: UUID, data: FirstStudentData) -> Student:
        async with self._uow_factory() as uow:
            guardian = await uow.guardians.get_by_person_id(person_id)
            if guardian is None:
                raise ResourceNotFound("No existe un tutor asociado a esta cuenta.")

            if await uow.avatars.get_by_id(data.avatar_id) is None:
                raise InvalidAvatar()

            support_condition = await uow.support_conditions.get_by_id(data.support_condition_id)
            if support_condition is None:
                raise InvalidSupportCondition()
            is_other_condition = support_condition.name == SUPPORT_CONDITION_NAME_OTHER
            if is_other_condition and not (data.support_condition_other or "").strip():
                raise InvalidSupportCondition("Debes especificar la condición.")
            if not is_other_condition and data.support_condition_other:
                raise InvalidSupportCondition(
                    "Solo puedes especificar una condición cuando eliges 'Otra condición (especificar)'."
                )

            student = Student(
                id=uuid.uuid4(),
                guardian_id=guardian.id,
                first_name=data.first_name,
                last_name=data.last_name,
                date_of_birth=data.date_of_birth,
                hash_pin=self._hasher.hash(data.pin),
                avatar_id=data.avatar_id,
                support_condition_id=data.support_condition_id,
                support_condition_other=data.support_condition_other,
                additional_support_need=data.additional_support_need,
            )
            await uow.students.add(student)
            await uow.commit()
            return student

    async def get_profile(self, person_id: UUID) -> tuple[Person, Guardian]:
        async with self._uow_factory() as uow:
            person = await uow.people.get_by_id(person_id)
            guardian = await uow.guardians.get_by_person_id(person_id)
            if person is None or guardian is None:
                raise ResourceNotFound("No existe un tutor asociado a esta cuenta.")
            return person, guardian

    # Updates only the fields a guardian is allowed to change about
    # themselves. Document type, document number, email and the document
    # issue date never pass through here — see the comment on
    # PersonRepository.update_profile for why those stay untouched.
    async def update_profile(self, person_id: UUID, data: UpdateGuardianProfileData) -> tuple[Person, Guardian]:
        async with self._uow_factory() as uow:
            person = await uow.people.get_by_id(person_id)
            guardian = await uow.guardians.get_by_person_id(person_id)
            if person is None or guardian is None:
                raise ResourceNotFound("No existe un tutor asociado a esta cuenta.")

            if await uow.relationship_types.get_by_id(data.relationship_type_id) is None:
                raise InvalidRelationshipType()

            await uow.people.update_profile(
                person_id,
                first_name=data.first_name,
                last_name=data.last_name,
                date_of_birth=data.date_of_birth,
                phone_country_code=data.phone_country_code,
                phone_number=data.phone_number,
            )
            await uow.guardians.update_relationship_type(guardian.id, data.relationship_type_id)
            await uow.commit()

            person.first_name = data.first_name
            person.last_name = data.last_name
            person.date_of_birth = data.date_of_birth
            person.phone_country_code = data.phone_country_code
            person.phone_number = data.phone_number
            guardian.relationship_type_id = data.relationship_type_id
            return person, guardian

    # Changes the guardian's password. The strength rules are already
    # checked in the API schema (the same _validar_password used at
    # registration), so this method just hashes the new password and saves
    # it. There's no "current password" field on purpose: to reach this the
    # guardian already passed the 2FA check for the portal. All their
    # sessions are closed after the change, in case the old password was known
    # by someone else.
    async def change_password(self, person_id: UUID, new_password: str) -> None:
        async with self._uow_factory() as uow:
            person = await uow.people.get_by_id(person_id)
            if person is None:
                raise ResourceNotFound("No existe una cuenta asociada a este tutor.")
            await uow.people.update_password(person_id, self._hasher.hash(new_password))
            await uow.commit()
        await self._sessions.revoke_all(person_id, "password_changed")

    # Right to erasure. Deletes the guardian and cascades to their students and
    # consents in this service's own database. It doesn't reach into
    # classroom-service or content-service, so enrollments and lessons tied
    # to the deleted students stay there and need to be cleaned up by hand.
    async def delete_account(self, person_id: UUID) -> None:
        async with self._uow_factory() as uow:
            guardian = await uow.guardians.get_by_person_id(person_id)
            if guardian is None:
                raise ResourceNotFound("No existe un tutor asociado a esta cuenta.")
            await uow.guardians.delete(guardian.id)
            await uow.commit()
