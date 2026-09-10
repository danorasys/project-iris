from __future__ import annotations

import dataclasses
from typing import Callable
from uuid import UUID

from app.domain.entities import Student
from app.domain.exceptions import ResourceNotFound
from app.domain.ports import UnitOfWork

UowFactory = Callable[[], "UnitOfWork"]


class StudentService:
    """Self-service operations a logged-in student profile performs on
    itself. The first (and so far only) one: choosing an avatar after gaze
    calibration."""

    def __init__(self, uow_factory: UowFactory) -> None:
        self._uow_factory = uow_factory

    async def update_avatar(self, student_id: UUID, avatar: str) -> Student:
        async with self._uow_factory() as uow:
            student = await uow.students.get_by_id(student_id)
            if student is None:
                raise ResourceNotFound("No existe un perfil de estudiante con este id.")

            await uow.students.update_avatar(student_id, avatar)
            await uow.commit()
            return dataclasses.replace(student, avatar=avatar)
