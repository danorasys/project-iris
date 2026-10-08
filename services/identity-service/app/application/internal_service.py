# Queries used only by other services via /internal/*, never exposed to end
# clients. classroom-service needs the student's name and avatar plus the
# guardian's name and contact info, to give the teacher context when resolving an
# enrollment request, and the names it puts in the notifications it sends.

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
    student_avatar_id: int
    guardian_first_name: str
    guardian_last_name: str
    guardian_email: str
    guardian_phone: str
    # The id the guardian signs in with, so a notification can reach them.
    guardian_person_id: UUID


# One kid of a guardian, for the classes of the family (parents' portal).
@dataclass
class GuardianStudent:
    student_id: UUID
    first_name: str
    avatar_id: int


@dataclass
class TeacherName:
    first_name: str
    last_name: str


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
                student_avatar_id=student.avatar_id,
                guardian_first_name=person.first_name,
                guardian_last_name=person.last_name,
                guardian_email=person.email,
                guardian_phone=person.phone_e164(),
                guardian_person_id=person.id,
            )

    # The kids of a guardian, by the id the guardian signs in with. Not a
    # guardian: ResourceNotFound, so nobody else gets a list of kids.
    async def list_guardian_students(self, person_id: UUID) -> list[GuardianStudent]:
        async with self._uow_factory() as uow:
            guardian = await uow.guardians.get_by_person_id(person_id)
            if guardian is None:
                raise ResourceNotFound("Tutor no encontrado.")
            students = await uow.students.list_by_guardian(guardian.id)
            return [GuardianStudent(student_id=s.id, first_name=s.first_name, avatar_id=s.avatar_id) for s in students]

    # The name of a teacher, by the id they sign in with.
    async def get_teacher_name(self, person_id: UUID) -> TeacherName:
        async with self._uow_factory() as uow:
            teacher = await uow.teachers.get_by_person_id(person_id)
            person = await uow.people.get_by_id(person_id) if teacher is not None else None
            if person is None:
                raise ResourceNotFound("Docente no encontrado.")
            return TeacherName(first_name=person.first_name, last_name=person.last_name)
