"""Internal routes, only for other IRIS services. They need X-Internal-Key
and the gateway doesn't expose them."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import get_notification_service, verify_internal_key
from app.application.notification_service import NotificationService

router = APIRouter(prefix="/internal", tags=["internal"], dependencies=[Depends(verify_internal_key)])


class EraseRequest(BaseModel):
    # The people whose trays go (the guardian or the teacher), and the kids
    # whose trays go and who stop showing up in anybody else's.
    person_ids: list[UUID] = Field(default_factory=list, max_length=10)
    student_ids: list[UUID] = Field(default_factory=list, max_length=100)


class EraseResponse(BaseModel):
    notifications_deleted: int


@router.post("/erasures", response_model=EraseResponse)
async def erase(
    payload: EraseRequest, notifications: Annotated[NotificationService, Depends(get_notification_service)]
) -> EraseResponse:
    """identity-service asks this before deleting an account (HU-91, HU-92).
    Asking again finds none."""
    deleted = await notifications.erase(list(dict.fromkeys(payload.person_ids)), list(dict.fromkeys(payload.student_ids)))
    return EraseResponse(notifications_deleted=deleted)
