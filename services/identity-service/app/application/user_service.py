# Read-only query for the currently authenticated guardian or teacher's own
# account data, exposed via GET /users/me.

from __future__ import annotations

from typing import Callable
from uuid import UUID

from app.domain.entities import Person
from app.domain.exceptions import ResourceNotFound
from app.domain.ports import UnitOfWork

UowFactory = Callable[[], "UnitOfWork"]


class UserQueryService:
    def __init__(self, uow_factory: UowFactory) -> None:
        self._uow_factory = uow_factory

    async def get_current_user(self, person_id: UUID) -> Person:
        async with self._uow_factory() as uow:
            person = await uow.people.get_by_id(person_id)
        if person is None:
            raise ResourceNotFound("Usuario no encontrado.")
        return person
