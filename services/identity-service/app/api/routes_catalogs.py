from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import get_catalog_query_service
from app.api.schemas import AvatarResponse, DocumentTypeResponse, RelationshipTypeResponse, SupportConditionResponse
from app.application.catalog_service import CatalogQueryService

router = APIRouter(prefix="/catalogs", tags=["catalogs"])

CatalogServiceDep = Annotated[CatalogQueryService, Depends(get_catalog_query_service)]


@router.get("/document-types", response_model=list[DocumentTypeResponse])
async def list_document_types(catalogs: CatalogServiceDep) -> list[DocumentTypeResponse]:
    document_types = await catalogs.list_document_types()
    return [DocumentTypeResponse(**dt.__dict__) for dt in document_types]


@router.get("/relationship-types", response_model=list[RelationshipTypeResponse])
async def list_relationship_types(catalogs: CatalogServiceDep) -> list[RelationshipTypeResponse]:
    relationship_types = await catalogs.list_relationship_types()
    return [RelationshipTypeResponse(**rt.__dict__) for rt in relationship_types]


@router.get("/support-conditions", response_model=list[SupportConditionResponse])
async def list_support_conditions(catalogs: CatalogServiceDep) -> list[SupportConditionResponse]:
    support_conditions = await catalogs.list_support_conditions()
    return [SupportConditionResponse(**sc.__dict__) for sc in support_conditions]


@router.get("/avatars", response_model=list[AvatarResponse])
async def list_avatars(catalogs: CatalogServiceDep) -> list[AvatarResponse]:
    avatars = await catalogs.list_avatars()
    return [AvatarResponse(**a.__dict__) for a in avatars]
