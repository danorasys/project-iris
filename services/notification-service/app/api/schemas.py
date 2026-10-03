from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.domain.entities import Notification, NotificationPage


class NotificationOut(BaseModel):
    id: UUID
    event: str
    classroom_id: UUID
    enrollment_id: UUID
    student_id: UUID | None
    student_name: str | None
    classroom_name: str | None
    # Who it's from: the kid who asked, or the teacher who answered.
    sender_name: str | None
    decision: str | None
    read: bool
    created_at: datetime

    @classmethod
    def from_entity(cls, notification: Notification) -> "NotificationOut":
        return cls(
            id=notification.id,
            event=notification.event,
            classroom_id=notification.classroom_id,
            enrollment_id=notification.enrollment_id,
            student_id=notification.student_id,
            student_name=notification.student_name,
            classroom_name=notification.classroom_name,
            sender_name=notification.sender_name,
            decision=notification.decision,
            read=notification.read,
            created_at=notification.created_at,
        )


class NotificationPageOut(BaseModel):
    items: list[NotificationOut]
    total: int
    unread_count: int
    page: int
    page_size: int

    @classmethod
    def from_page(cls, result: NotificationPage, page: int, page_size: int) -> "NotificationPageOut":
        return cls(
            items=[NotificationOut.from_entity(n) for n in result.items],
            total=result.total,
            unread_count=result.unread,
            page=page,
            page_size=page_size,
        )
