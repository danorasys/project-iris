from __future__ import annotations

import dataclasses
from typing import Callable
from uuid import UUID

from app.domain.entities import Student
from app.domain.exceptions import InvalidAvatar, ResourceNotFound
from app.domain.ports import UnitOfWork

UowFactory = Callable[[], "UnitOfWork"]


# Self-service operations a logged-in student profile performs on
# itself. The first (and so far only) one: choosing an avatar after gaze
# calibration.
class StudentService:
    def __init__(self, uow_factory: UowFactory) -> None:
        self._uow_factory = uow_factory

    async def update_avatar(self, student_id: UUID, avatar_id: int) -> Student:
        async with self._uow_factory() as uow:
            student = await uow.students.get_by_id(student_id)
            if student is None:
                raise ResourceNotFound("No existe un perfil de estudiante con este id.")
            if await uow.avatars.get_by_id(avatar_id) is None:
                raise InvalidAvatar()

            await uow.students.update_avatar(student_id, avatar_id)
            await uow.commit()
            return dataclasses.replace(student, avatar_id=avatar_id)
