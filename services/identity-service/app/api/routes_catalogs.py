from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import get_catalog_query_service
from app.api.schemas import DocumentTypeResponse, RelationshipTypeResponse
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
