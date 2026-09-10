from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.domain.entities import Notification


class NotificationOut(BaseModel):
    id: UUID
    event: str
    classroom_id: UUID
    enrollment_id: UUID
    student_name: str | None
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
            student_name=notification.student_name,
            decision=notification.decision,
            read=notification.read,
            created_at=notification.created_at,
        )
