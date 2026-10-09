from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.domain.entities import Notification, NotificationPage


class NotificationOut(BaseModel):
    id: UUID
    event: str
    classroom_id: UUID
    enrollment_id: UUID
    student_id: UUID | None
    student_name: str | None
    classroom_name: str | None
    # Who it's from: the guardian who wrote or asked, or the teacher who
    # answered.
    sender_name: str | None
    decision: str | None
    # Only in a message, from a guardian (HU-48) or from the teacher (HU-77).
    subject: str | None = None
    body: str | None = None
    # The lesson it's about, and the extra if it's one (HU-83, HU-69).
    lesson_id: UUID | None = None
    lesson_title: str | None = None
    extra_title: str | None = None
    # The score of a kid's first try (HU-69).
    correct: int | None = None
    total: int | None = None
    # Who a message went to: "student" or "guardian" for the teacher's,
    # "teacher" for the copy a guardian keeps of theirs.
    addressee: str | None = None
    # The conversation of a message (HU-51).
    thread_id: UUID | None = None
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
            subject=notification.subject,
            body=notification.body,
            lesson_id=notification.lesson_id,
            lesson_title=notification.lesson_title,
            extra_title=notification.extra_title,
            correct=notification.score_correct,
            total=notification.score_total,
            addressee=notification.addressee,
            thread_id=notification.thread_id,
            read=notification.read,
            created_at=notification.created_at,
        )


# Several notifications picked in the tray, to delete them at once. At
# most a few pages of them; repeated ids count once.
class DeleteNotificationsIn(BaseModel):
    ids: list[UUID] = Field(min_length=1, max_length=50)


class DeleteNotificationsOut(BaseModel):
    deleted: int


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
