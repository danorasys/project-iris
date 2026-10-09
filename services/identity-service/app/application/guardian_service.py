from __future__ import annotations

import uuid
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Callable
from uuid import UUID

from app.application.auth_service import student_pin_key
from app.application.dtos import FirstStudentData, UpdateGuardianProfileData, UpdateStudentData
from app.domain.entities import (
    PROFILE_DECLARATION_VERSION,
    Guardian,
    Person,
    ProfileChange,
    Student,
)
from app.domain.exceptions import (
    AttemptLimitExceeded,
    BirthDateAfterDocumentIssued,
    InvalidAvatar,
    InvalidRelationshipType,
    PinSameAsCurrent,
    ResourceNotFound,
    WrongCurrentPin,
)
from app.application.password_change import PasswordChangeService
from app.application.session_service import SessionService
from app.application.support_conditions import check_support_conditions
from app.domain.ports import AttemptLockout, PasswordHasher, UnitOfWork
from app.security_log import log_security_event

UowFactory = Callable[[], "UnitOfWork"]


class GuardianService:
    def __init__(
        self,
        uow_factory: UowFactory,
        password_hasher: PasswordHasher,
        sessions: SessionService,
        password_lockout: AttemptLockout,
        account_lockout: AttemptLockout,
        pin_lockout: AttemptLockout,
    ) -> None:
        self._uow_factory = uow_factory
        self._hasher = password_hasher
        self._sessions = sessions
        self._password_lockout = password_lockout
        self._account_lockout = account_lockout
        self._pin_lockout = pin_lockout
        self._password_change = PasswordChangeService(
            uow_factory, password_hasher, sessions, password_lockout, account_lockout
        )

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

            await check_support_conditions(uow, data.support_condition_ids, data.support_condition_other)

            student = Student(
                id=uuid.uuid4(),
                guardian_id=guardian.id,
                first_name=data.first_name,
                last_name=data.last_name,
                date_of_birth=data.date_of_birth,
                hash_pin=self._hasher.hash(data.pin),
                avatar_id=data.avatar_id,
                support_condition_ids=data.support_condition_ids,
                support_condition_other=data.support_condition_other,
                additional_support_need=data.additional_support_need,
            )
            await uow.students.add(student)
            await uow.commit()
            return student

    # One kid with all their data. A kid of another guardian answers the same
    # as one that doesn't exist, so ids can't be probed from outside.
    async def get_student(self, person_id: UUID, student_id: UUID) -> Student:
        async with self._uow_factory() as uow:
            return await _own_student(uow, person_id, student_id)

    # Changes the data of one of the guardian's kids. Like with their own
    # profile, the declaration was already checked by the API, and the
    # change is recorded with the names of the fields, never their values.
    async def update_student(
        self, person_id: UUID, student_id: UUID, data: UpdateStudentData, session_id: str | None
    ) -> Student:
        async with self._uow_factory() as uow:
            student = await _own_student(uow, person_id, student_id)
            if await uow.avatars.get_by_id(data.avatar_id) is None:
                raise InvalidAvatar()
            await check_support_conditions(uow, data.support_condition_ids, data.support_condition_other)

            new_values = asdict(data)
            changed_fields = [name for name, value in new_values.items() if getattr(student, name) != value]

            await uow.students.update_details(student_id, **new_values)
            if changed_fields:
                await uow.profile_changes.add(
                    ProfileChange(
                        id=uuid.uuid4(),
                        person_id=person_id,
                        student_id=student_id,
                        session_id=session_id,
                        changed_fields=changed_fields,
                        declaration_version=PROFILE_DECLARATION_VERSION,
                        changed_at=datetime.now(timezone.utc),
                    )
                )
            await uow.commit()
            if changed_fields:
                log_security_event(
                    "student_profile_updated",
                    person=person_id,
                    student=student_id,
                    session=session_id,
                    fields=",".join(changed_fields),
                )

            for name, value in new_values.items():
                setattr(student, name, value)
            return student

    # Sets a new PIN for one of the guardian's kids, only with the current
    # one. Wrong current PINs are counted apart from the kid's own wrong
    # tries at the login, so a guardian's mistakes here don't lock the kid
    # out. The kid's open sessions are closed, so the old PIN stops being
    # useful right away.
    async def change_student_pin(self, person_id: UUID, student_id: UUID, current_pin: str, new_pin: str) -> None:
        await self.check_student_pin(person_id, student_id, current_pin)
        if current_pin == new_pin:
            raise PinSameAsCurrent()
        async with self._uow_factory() as uow:
            await uow.students.update_pin(student_id, self._hasher.hash(new_pin))
            await uow.commit()
        # The kid can get in with the new PIN at once, without waiting.
        await self._pin_lockout.registrar_exito(student_pin_key(student_id))
        await self._sessions.revoke_all(student_id, "pin_changed")
        log_security_event("student_pin_changed", person=person_id, student=student_id)

    # Says if that is the kid's current PIN, without changing anything. The
    # portal asks it right after the guardian types it, to tell them at
    # once. It counts wrong tries the same way the change does.
    async def check_student_pin(self, person_id: UUID, student_id: UUID, current_pin: str) -> None:
        async with self._uow_factory() as uow:
            student = await _own_student(uow, person_id, student_id)

        form_key = f"pin-change:{student_id}"
        wait = await self._pin_lockout.segundos_bloqueado(form_key)
        if wait:
            raise AttemptLimitExceeded(retry_after_seconds=wait)

        if not self._hasher.verificar(current_pin, student.hash_pin):
            wait = await self._pin_lockout.registrar_fallo(form_key)
            if wait:
                log_security_event("pin_change_locked", person=person_id, student=student_id, wait=wait)
                raise AttemptLimitExceeded(retry_after_seconds=wait)
            raise WrongCurrentPin()

        await self._pin_lockout.registrar_exito(form_key)

    async def get_profile(self, person_id: UUID) -> tuple[Person, Guardian]:
        async with self._uow_factory() as uow:
            person = await uow.people.get_by_id(person_id)
            guardian = await uow.guardians.get_by_person_id(person_id)
            if person is None or guardian is None:
                raise ResourceNotFound("No existe un tutor asociado a esta cuenta.")
            return person, guardian

    # Only what a guardian may change about themselves: document, email and
    # issue date never pass through here. It's only called after the truthful
    # declaration, which is saved together with the change.
    async def update_profile(
        self, person_id: UUID, data: UpdateGuardianProfileData, session_id: str | None
    ) -> tuple[Person, Guardian]:
        async with self._uow_factory() as uow:
            person = await uow.people.get_by_id(person_id)
            guardian = await uow.guardians.get_by_person_id(person_id)
            if person is None or guardian is None:
                raise ResourceNotFound("No existe un tutor asociado a esta cuenta.")

            if await uow.relationship_types.get_by_id(data.relationship_type_id) is None:
                raise InvalidRelationshipType()
            # The issue date can't be edited here, so the new birth date is
            # checked against the one already saved (at registration this is
            # checked in the schema, where both dates arrive together).
            if person.document_issued_at and data.date_of_birth > person.document_issued_at:
                raise BirthDateAfterDocumentIssued()

            before = {
                "first_name": person.first_name,
                "last_name": person.last_name,
                "date_of_birth": person.date_of_birth,
                "phone_country_code": person.phone_country_code,
                "phone_number": person.phone_number,
                "relationship_type_id": guardian.relationship_type_id,
            }
            changed_fields = [name for name, value in asdict(data).items() if before[name] != value]

            await uow.people.update_profile(
                person_id,
                first_name=data.first_name,
                last_name=data.last_name,
                date_of_birth=data.date_of_birth,
                phone_country_code=data.phone_country_code,
                phone_number=data.phone_number,
            )
            await uow.guardians.update_relationship_type(guardian.id, data.relationship_type_id)
            # Saved in the same transaction as the change, so there can't be a
            # change without its record, or a record of a change that failed.
            # Saving with nothing different leaves nothing to record.
            if changed_fields:
                await uow.profile_changes.add(
                    ProfileChange(
                        id=uuid.uuid4(),
                        person_id=person_id,
                        session_id=session_id,
                        changed_fields=changed_fields,
                        declaration_version=PROFILE_DECLARATION_VERSION,
                        changed_at=datetime.now(timezone.utc),
                    )
                )
            await uow.commit()
            if changed_fields:
                # Only the names of the fields, the values stay out of the logs.
                log_security_event(
                    "profile_updated", person=person_id, session=session_id, fields=",".join(changed_fields)
                )

            person.first_name = data.first_name
            person.last_name = data.last_name
            person.date_of_birth = data.date_of_birth
            person.phone_country_code = data.phone_country_code
            person.phone_number = data.phone_number
            guardian.relationship_type_id = data.relationship_type_id
            return person, guardian

    # Changes the password after checking the current one (the strength rules
    # are in the API schema). Wrong tries count here and in the login's lock
    # per account, so switching forms gives no extra tries. All sessions close.
    # Same rules for guardians and teachers, see PasswordChangeService.
    async def change_password(self, person_id: UUID, current_password: str, new_password: str) -> None:
        await self._password_change.change_password(person_id, current_password, new_password)


# The kid, only if they belong to this guardian.
async def _own_student(uow: UnitOfWork, person_id: UUID, student_id: UUID) -> Student:
    guardian = await uow.guardians.get_by_person_id(person_id)
    if guardian is None:
        raise ResourceNotFound("No existe un tutor asociado a esta cuenta.")
    student = await uow.students.get_by_id(student_id)
    if student is None or student.guardian_id != guardian.id:
        raise ResourceNotFound("No existe ese estudiante en tu cuenta.")
    return student
