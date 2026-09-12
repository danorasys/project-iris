"""Queries used only by other services via /internal/*, never exposed to end
clients. classroom-service needs the student's name and avatar plus the
guardian's name and contact info, to give the teacher context when resolving an
enrollment request."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable
from uuid import UUID

from app.domain.exceptions import ResourceNotFound
from app.domain.ports import UnitOfWork

UowFactory = Callable[[], "UnitOfWork"]


@dataclass
class StudentWithGuardian:
    student_id: UUID
    student_first_name: str
    student_avatar: str
    guardian_first_name: str
    guardian_last_name: str
    guardian_email: str
    guardian_phone: str


class InternalQueryService:
    def __init__(self, uow_factory: UowFactory) -> None:
        self._uow_factory = uow_factory

    async def get_student_with_guardian(self, student_id: UUID) -> StudentWithGuardian:
        async with self._uow_factory() as uow:
            student = await uow.students.get_by_id(student_id)
            if student is None:
                raise ResourceNotFound("Estudiante no encontrado.")
            guardian = await uow.guardians.get_by_id(student.guardian_id)
            if guardian is None:
                raise ResourceNotFound("Tutor no encontrado.")
            person = await uow.people.get_by_id(guardian.person_id)
            if person is None:
                raise ResourceNotFound("Tutor no encontrado.")

            return StudentWithGuardian(
                student_id=student.id,
                student_first_name=student.first_name,
                student_avatar=student.avatar,
                guardian_first_name=person.first_name,
                guardian_last_name=person.last_name,
                guardian_email=person.email,
                guardian_phone=person.phone_e164(),
            )
