from __future__ import annotations

import uuid
from typing import Callable
from uuid import UUID

from app.application.dtos import FirstStudentData
from app.domain.entities import Student
from app.domain.exceptions import ResourceNotFound
from app.domain.ports import PasswordHasher, UnitOfWork

UowFactory = Callable[[], "UnitOfWork"]


class GuardianService:
    def __init__(self, uow_factory: UowFactory, password_hasher: PasswordHasher) -> None:
        self._uow_factory = uow_factory
        self._hasher = password_hasher

    async def list_students(self, person_id: UUID) -> list[Student]:
        async with self._uow_factory() as uow:
            guardian = await uow.guardians.get_by_person_id(person_id)
            if guardian is None:
                raise ResourceNotFound("No existe un tutor asociado a esta cuenta.")
            return await uow.students.list_by_guardian(guardian.id)

    async def create_student(self, person_id: UUID, data: FirstStudentData) -> Student:
        """Creates an additional student profile under the same guardian, for siblings."""
        async with self._uow_factory() as uow:
            guardian = await uow.guardians.get_by_person_id(person_id)
            if guardian is None:
                raise ResourceNotFound("No existe un tutor asociado a esta cuenta.")

            student = Student(
                id=uuid.uuid4(),
                guardian_id=guardian.id,
                first_name=data.first_name,
                last_name=data.last_name,
                date_of_birth=data.date_of_birth,
                hash_pin=self._hasher.hash(data.pin),
                avatar=data.avatar,
                support_condition=data.support_condition,
            )
            await uow.students.add(student)
            await uow.commit()
            return student

    async def delete_account(self, person_id: UUID) -> None:
        """Right to erasure. Deletes the guardian and cascades to their students and
        consents in this service's own database. It doesn't reach into
        classroom-service or content-service, so enrollments and lessons tied
        to the deleted students stay there and need to be cleaned up by hand."""
        async with self._uow_factory() as uow:
            guardian = await uow.guardians.get_by_person_id(person_id)
            if guardian is None:
                raise ResourceNotFound("No existe un tutor asociado a esta cuenta.")
            await uow.guardians.delete(guardian.id)
            await uow.commit()
