"""Internal endpoint content-service uses to check authorization on a classroom
without duplicating the owner/enrollment logic. Protected by X-Internal-Key
on top of network isolation.

Always responds 200 with {"authorized": true|false}. The caller decides
whether to deny, never this endpoint. 404 only if the classroom doesn't exist."""

from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.deps import get_classroom_service, verify_internal_key
from app.api.schemas import InternalAccessResponse
from app.application.classroom_service import ClassroomService

router = APIRouter(prefix="/internal", tags=["internal"])


@router.get(
    "/classrooms/{classroom_id}/access",
    response_model=InternalAccessResponse,
    dependencies=[Depends(verify_internal_key)],
)
async def verify_access(
    classroom_id: UUID,
    subject_id: UUID,
    role: Literal["teacher", "student"],
    classrooms: Annotated[ClassroomService, Depends(get_classroom_service)],
) -> InternalAccessResponse:
    authorized = await classrooms.verify_access(classroom_id, subject_id, role)
    return InternalAccessResponse(authorized=authorized)
