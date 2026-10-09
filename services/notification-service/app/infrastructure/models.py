# SQLAlchemy models.
#
# recipient_id, student_id, classroom_id and enrollment_id are reference UUIDs
# pointing at identity_db and classroom_db, with no real ForeignKey across
# databases, same convention as the other services.

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Index, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db import Base


def _uuid4() -> uuid.UUID:
    return uuid.uuid4()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class NotificationModel(Base):
    __tablename__ = "notifications"
    # Every query is about one person's tray, newest first, so this index
    # serves the list, its count and the count of unread ones.
    __table_args__ = (
        Index("ix_notifications_recipient_created", "recipient_id", "recipient_role", "created_at"),
        Index("ix_notifications_recipient_thread", "recipient_id", "thread_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    recipient_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True))
    # "teacher", "guardian" or "student", see app/domain/entities.py.
    recipient_role: Mapped[str] = mapped_column(String(20))
    event: Mapped[str] = mapped_column(String(40))
    classroom_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True))
    enrollment_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True))
    student_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    student_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    classroom_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    sender_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    decision: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # A guardian's message to a teacher (HU-48), see migration 0003.
    subject: Mapped[str | None] = mapped_column(String(120), nullable=True)
    body: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    # Lessons, reports and the teacher's messages, see migration 0004.
    lesson_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    lesson_title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    extra_title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    score_correct: Mapped[int | None] = mapped_column(Integer, nullable=True)
    score_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    addressee: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # The conversation of a message (HU-51), see migration 0005.
    thread_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
