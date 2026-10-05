# Read-only queries for the registration catalogs (document types,
# guardian/student relationship types, avatars). Exposed publicly via
# /catalogs/*, the registration forms fetch these before a session exists.

from __future__ import annotations

from typing import Callable

from app.domain.entities import (
    Avatar,
    DocumentType,
    RelationshipType,
    SignedDownload,
    SupportCondition,
)
from app.domain.exceptions import ResourceNotFound
from app.domain.ports import ObjectStorage, UnitOfWork

UowFactory = Callable[[], "UnitOfWork"]


class CatalogQueryService:
    def __init__(self, uow_factory: UowFactory, storage: ObjectStorage) -> None:
        self._uow_factory = uow_factory
        self._storage = storage

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

    async def get_avatar_image(self, avatar_id: int) -> SignedDownload:
        async with self._uow_factory() as uow:
            avatar = await uow.avatars.get_by_id(avatar_id)
        if avatar is None:
            raise ResourceNotFound("El avatar solicitado no existe.")
        return self._storage.sign_download(avatar.image_key)
