"""Use case: persist notification events coming from Redis, and let a
teacher list and read their own notifications over REST."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Callable
from uuid import UUID

from app.domain.entities import REQUEST_CREATED, REQUEST_RESOLVED, Notification
from app.domain.exceptions import NotificationNotFound, PermissionDenied
from app.domain.ports import UnitOfWork

UowFactory = Callable[[], UnitOfWork]


class NotificationService:
    def __init__(self, uow_factory: UowFactory) -> None:
        self._uow_factory = uow_factory

    async def record_event(self, payload: dict[str, object]) -> None:
        """Turns a raw event from the classroom.requests Redis channel into a
        stored notification. Unknown event types are ignored, not every
        message on the channel has to become a notification."""
        event = payload.get("event")
        teacher_id = payload.get("teacher_id")
        classroom_id = payload.get("classroom_id")
        enrollment_id = payload.get("enrollment_id")
        if event not in (REQUEST_CREATED, REQUEST_RESOLVED) or not teacher_id or not classroom_id or not enrollment_id:
            return

        student_name = payload.get("student_name")
        decision = payload.get("decision")
        notification = Notification(
            id=uuid.uuid4(),
            teacher_id=UUID(str(teacher_id)),
            event=str(event),
            classroom_id=UUID(str(classroom_id)),
            enrollment_id=UUID(str(enrollment_id)),
            student_name=str(student_name) if event == REQUEST_CREATED and student_name is not None else None,
            decision=str(decision) if event == REQUEST_RESOLVED and decision is not None else None,
            read=False,
            created_at=datetime.now(timezone.utc),
        )

        async with self._uow_factory() as uow:
            await uow.notifications.add(notification)
            await uow.commit()

    async def list_my_notifications(self, teacher_id: UUID) -> list[Notification]:
        async with self._uow_factory() as uow:
            return await uow.notifications.list_by_teacher(teacher_id)

    async def mark_as_read(self, notification_id: UUID, teacher_id: UUID) -> Notification:
        async with self._uow_factory() as uow:
            notification = await uow.notifications.get_by_id(notification_id)
            if notification is None:
                raise NotificationNotFound()
            if notification.teacher_id != teacher_id:
                raise PermissionDenied()
            notification.read = True
            await uow.notifications.mark_read(notification)
            await uow.commit()
            return notification
