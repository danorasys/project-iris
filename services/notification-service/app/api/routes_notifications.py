"""REST routes for the teacher's notification tray, polled periodically by
the frontend (see apps/web's useNotifications.ts) instead of pushed live."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, get_notification_service, require_role
from app.api.schemas import NotificationOut
from app.application.notification_service import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])

TeacherDep = Annotated[CurrentUser, Depends(require_role("teacher"))]
ServiceDep = Annotated[NotificationService, Depends(get_notification_service)]


@router.get("/me", response_model=list[NotificationOut])
async def list_my_notifications(user: TeacherDep, service: ServiceDep) -> list[NotificationOut]:
    notifications = await service.list_my_notifications(user.subject_id)
    return [NotificationOut.from_entity(n) for n in notifications]


@router.patch("/{notification_id}/read", response_model=NotificationOut)
async def mark_notification_read(notification_id: UUID, user: TeacherDep, service: ServiceDep) -> NotificationOut:
    notification = await service.mark_as_read(notification_id, user.subject_id)
    return NotificationOut.from_entity(notification)
