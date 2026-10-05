# The teacher's profile (HU-96): what they tell the families about their
# studies and experience. Saved at registration if they fill it in, and
# edited later from their panel.

from __future__ import annotations

import uuid
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Callable
from uuid import UUID

from app.application.dtos import UpdateTeacherAccountData
from app.domain.entities import PROFILE_DECLARATION_VERSION, Person, ProfileChange, Teacher, TeacherProfile
from app.domain.exceptions import BirthDateAfterDocumentIssued, ResourceNotFound
from app.domain.ports import UnitOfWork
from app.security_log import log_security_event

UowFactory = Callable[[], UnitOfWork]


class TeacherProfileService:
    def __init__(self, uow_factory: UowFactory) -> None:
        self._uow_factory = uow_factory

    # The teacher's own account data, for their portal (HU-71).
    async def get_my_account(self, person_id: UUID) -> tuple[Person, Teacher]:
        async with self._uow_factory() as uow:
            person = await uow.people.get_by_id(person_id)
            teacher = await uow.teachers.get_by_person_id(person_id)
            if person is None or teacher is None:
                raise ResourceNotFound("Docente no encontrado.")
            return person, teacher

    # What a teacher may change about themselves (HU-71), never the document
    # or the email. Same as the guardian's: only after the truthful
    # declaration, and the changed field names go in the same transaction.
    async def update_my_account(
        self, person_id: UUID, data: UpdateTeacherAccountData, session_id: str | None
    ) -> tuple[Person, Teacher]:
        async with self._uow_factory() as uow:
            person = await uow.people.get_by_id(person_id)
            teacher = await uow.teachers.get_by_person_id(person_id)
            if person is None or teacher is None:
                raise ResourceNotFound("Docente no encontrado.")
            if person.document_issued_at and data.date_of_birth > person.document_issued_at:
                raise BirthDateAfterDocumentIssued()

            before = {
                "first_name": person.first_name,
                "last_name": person.last_name,
                "date_of_birth": person.date_of_birth,
                "phone_country_code": person.phone_country_code,
                "phone_number": person.phone_number,
                "institution": teacher.institution,
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
            await uow.teachers.update_institution(teacher.id, data.institution)
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
            log_security_event("profile_updated", person=person_id, session=session_id, fields=",".join(changed_fields))

        person.first_name = data.first_name
        person.last_name = data.last_name
        person.date_of_birth = data.date_of_birth
        person.phone_country_code = data.phone_country_code
        person.phone_number = data.phone_number
        teacher.institution = data.institution
        return person, teacher

    async def get_my_profile(self, person_id: UUID) -> TeacherProfile:
        async with self._uow_factory() as uow:
            teacher = await uow.teachers.get_by_person_id(person_id)
            if teacher is None:
                raise ResourceNotFound("Docente no encontrado.")
            return await uow.teacher_profiles.get(teacher.id)

    # Same rules as the personal data: the API only gets here after the
    # truthful declaration, and the parts that changed (never their content)
    # are recorded in the same transaction as the change.
    async def update_my_profile(
        self, person_id: UUID, profile: TeacherProfile, session_id: str | None = None
    ) -> TeacherProfile:
        async with self._uow_factory() as uow:
            teacher = await uow.teachers.get_by_person_id(person_id)
            if teacher is None:
                raise ResourceNotFound("Docente no encontrado.")
            before = await uow.teacher_profiles.get(teacher.id)
            # Both come sorted the same way (TeacherProfile does it), so a
            # list only counts as changed if its entries really changed.
            changed_fields = [
                name
                for name, old, new in (
                    ("about", before.about, profile.about),
                    ("studies", before.studies, profile.studies),
                    ("experiences", before.experiences, profile.experiences),
                )
                if old != new
            ]
            await uow.teacher_profiles.replace(teacher.id, profile)
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
            saved = await uow.teacher_profiles.get(teacher.id)
        if changed_fields:
            log_security_event(
                "teacher_profile_updated", person=person_id, session=session_id, fields=",".join(changed_fields)
            )
        return saved
