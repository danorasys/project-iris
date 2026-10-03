"""REST routes for the notification tray of a teacher or a guardian,
asked by the frontend from time to time (no live push). Each person only
ever sees, reads or deletes their own."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import CurrentUser, get_notification_service, require_tray_owner
from app.api.schemas import NotificationOut, NotificationPageOut
from app.application.notification_service import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])

ReaderDep = Annotated[CurrentUser, Depends(require_tray_owner(renew=False))]
ActorDep = Annotated[CurrentUser, Depends(require_tray_owner(renew=True))]
ServiceDep = Annotated[NotificationService, Depends(get_notification_service)]


@router.get("/me", response_model=NotificationPageOut)
async def list_my_notifications(
    user: ReaderDep,
    service: ServiceDep,
    page: Annotated[int, Query(ge=1, le=10_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 10,
) -> NotificationPageOut:
    """The tray, newest first and one page at a time, with the total and how
    many are still unread."""
    result = await service.list_page(user.subject_id, user.role, page, page_size)
    return NotificationPageOut.from_page(result, page, page_size)


@router.patch("/{notification_id}/read", response_model=NotificationOut)
async def mark_notification_read(notification_id: UUID, user: ActorDep, service: ServiceDep) -> NotificationOut:
    notification = await service.mark_as_read(notification_id, user.subject_id, user.role)
    return NotificationOut.from_entity(notification)


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_notification(notification_id: UUID, user: ActorDep, service: ServiceDep) -> None:
    """Deletes one of your notifications for good."""
    await service.delete(notification_id, user.subject_id, user.role)
