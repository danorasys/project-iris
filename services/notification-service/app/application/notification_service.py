# Use case: turn the events coming from Redis into notifications, and let
# each person (a teacher or a guardian) see, read and delete their own.

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Callable
from uuid import UUID

from app.domain.entities import (
    REQUEST_CREATED,
    REQUEST_RESOLVED,
    ROLE_GUARDIAN,
    ROLE_TEACHER,
    Notification,
    NotificationPage,
)
from app.domain.exceptions import NotificationNotFound
from app.domain.ports import UnitOfWork

UowFactory = Callable[[], UnitOfWork]


def _uuid_or_none(value: object) -> UUID | None:
    try:
        return UUID(str(value)) if value else None
    except ValueError:
        return None


# Texts that come in the event, cut to the size of their columns.
def _text_or_none(value: object, max_length: int) -> str | None:
    return str(value)[:max_length] if value else None


class NotificationService:
    def __init__(self, uow_factory: UowFactory) -> None:
        self._uow_factory = uow_factory

    # Turns a raw event from the classroom.requests Redis channel into
    # stored notifications: always one for the teacher, and one for the
    # guardian when the event says who they are (an event from an older
    # classroom-service doesn't). Unknown event types are ignored.
    async def record_event(self, payload: dict[str, object]) -> None:
        event = payload.get("event")
        teacher_id = _uuid_or_none(payload.get("teacher_id"))
        classroom_id = _uuid_or_none(payload.get("classroom_id"))
        enrollment_id = _uuid_or_none(payload.get("enrollment_id"))
        if event not in (REQUEST_CREATED, REQUEST_RESOLVED) or not teacher_id or not classroom_id or not enrollment_id:
            return

        now = datetime.now(timezone.utc)
        student_name = _text_or_none(payload.get("student_name"), 120)
        decision = _text_or_none(payload.get("decision"), 20) if event == REQUEST_RESOLVED else None

        def notification_for(recipient_id: UUID, role: str, sender_name: str | None) -> Notification:
            return Notification(
                id=uuid.uuid4(),
                recipient_id=recipient_id,
                recipient_role=role,
                event=str(event),
                classroom_id=classroom_id,
                enrollment_id=enrollment_id,
                student_name=student_name,
                decision=decision,
                read=False,
                created_at=now,
                student_id=_uuid_or_none(payload.get("student_id")),
                classroom_name=_text_or_none(payload.get("classroom_name"), 120),
                sender_name=sender_name,
            )

        # The teacher's is the same as before: who asked, or what they decided.
        notifications = [notification_for(teacher_id, ROLE_TEACHER, None)]
        guardian_id = _uuid_or_none(payload.get("guardian_id"))
        if guardian_id is not None:
            # For the guardian it comes from their kid when they ask to join,
            # and from the teacher when the request is answered.
            sender = student_name if event == REQUEST_CREATED else _text_or_none(payload.get("teacher_name"), 255)
            notifications.append(notification_for(guardian_id, ROLE_GUARDIAN, sender))

        async with self._uow_factory() as uow:
            for notification in notifications:
                await uow.notifications.add(notification)
            await uow.commit()

    async def list_page(self, recipient_id: UUID, role: str, page: int, page_size: int) -> NotificationPage:
        async with self._uow_factory() as uow:
            return await uow.notifications.list_page(recipient_id, role, (page - 1) * page_size, page_size)

    async def mark_as_read(self, notification_id: UUID, recipient_id: UUID, role: str) -> Notification:
        async with self._uow_factory() as uow:
            notification = await _own_notification(uow, notification_id, recipient_id, role)
            notification.read = True
            await uow.notifications.mark_read(notification)
            await uow.commit()
            return notification

    async def delete(self, notification_id: UUID, recipient_id: UUID, role: str) -> None:
        async with self._uow_factory() as uow:
            await _own_notification(uow, notification_id, recipient_id, role)
            await uow.notifications.delete(notification_id)
            await uow.commit()


# Someone else's notification answers the same as one that doesn't exist,
# so ids can't be probed from outside.
async def _own_notification(uow: UnitOfWork, notification_id: UUID, recipient_id: UUID, role: str) -> Notification:
    notification = await uow.notifications.get_by_id(notification_id)
    if notification is None or notification.recipient_id != recipient_id or notification.recipient_role != role:
        raise NotificationNotFound()
    return notification
