from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Response

from app.api.deps import get_catalog_query_service
from app.api.media import media_response
from app.api.schemas import AvatarResponse, DocumentTypeResponse, RelationshipTypeResponse, SupportConditionResponse
from app.application.catalog_service import CatalogQueryService

router = APIRouter(prefix="/catalogs", tags=["catalogs"])

CatalogServiceDep = Annotated[CatalogQueryService, Depends(get_catalog_query_service)]

# The same for everyone, so any cache can keep it for a day.
_AVATAR_CACHE = "public, max-age=86400"


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
    return [AvatarResponse(id=a.id, name=a.name) for a in avatars]


# Public on purpose: the registration form shows the avatars before the family
# has an account, and they're IRIS artwork, not anyone's data. It still goes
# through the gateway like everything else, the storage is never exposed.
@router.get(
    "/avatars/{avatar_id}/image",
    response_class=Response,
    responses={200: {"content": {"image/*": {}}}, 404: {"description": "El avatar no existe."}},
)
async def get_avatar_image(avatar_id: Annotated[int, Path(gt=0)], catalogs: CatalogServiceDep) -> Response:
    signed = await catalogs.get_avatar_image(avatar_id)
    return media_response(signed, _AVATAR_CACHE)
