"""SQLAlchemy models.

teacher_id, classroom_id and enrollment_id are reference UUIDs pointing at
identity_db and classroom_db, with no real ForeignKey across databases,
same convention as the other services.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db import Base


def _uuid4() -> uuid.UUID:
    return uuid.uuid4()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class NotificationModel(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_teacher_created", "teacher_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    # No index=True here: ix_notifications_teacher_created already covers a
    # lookup by teacher_id alone (leftmost column of the composite), and also
    # serves the ORDER BY created_at that list_by_teacher always does.
    teacher_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True))
    event: Mapped[str] = mapped_column(String(40))
    classroom_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True))
    enrollment_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True))
    student_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    decision: Mapped[str | None] = mapped_column(String(20), nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
