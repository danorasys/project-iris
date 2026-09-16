# Read-only queries for the registration catalogs (document types,
# guardian/student relationship types). Exposed publicly via /catalogs/*, the
# registration forms fetch these before a session exists.

from __future__ import annotations

from typing import Callable

from app.domain.entities import Avatar, DocumentType, RelationshipType, SupportCondition
from app.domain.ports import UnitOfWork

UowFactory = Callable[[], "UnitOfWork"]


class CatalogQueryService:
    def __init__(self, uow_factory: UowFactory) -> None:
        self._uow_factory = uow_factory

    async def list_document_types(self) -> list[DocumentType]:
        async with self._uow_factory() as uow:
            return await uow.document_types.list_all()

    async def list_relationship_types(self) -> list[RelationshipType]:
        async with self._uow_factory() as uow:
            return await uow.relationship_types.list_all()

    async def list_support_conditions(self) -> list[SupportCondition]:
        async with self._uow_factory() as uow:
            return await uow.support_conditions.list_all()

    async def list_avatars(self) -> list[Avatar]:
        async with self._uow_factory() as uow:
            return await uow.avatars.list_all()
