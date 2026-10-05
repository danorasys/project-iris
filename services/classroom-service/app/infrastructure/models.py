# SQLAlchemy models. Uuid(as_uuid=True) is uuid on PostgreSQL and CHAR(32)
# on SQLite (the tests). teacher_id and student_id point to identity_db, so
# they have no real foreign key.

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.domain.entities import CLASSROOM_COLORS, DEFAULT_CLASSROOM_COLOR
from app.infrastructure.db import Base

_COLORS_SQL = ", ".join(f"'{color}'" for color in CLASSROOM_COLORS)


def _uuid4() -> uuid.UUID:
    return uuid.uuid4()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ClassroomModel(Base):
    __tablename__ = "classrooms"
    __table_args__ = (CheckConstraint(f"color IN ({_COLORS_SQL})", name="ck_classrooms_color"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    teacher_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(1000))
    logo_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    enrollment_code: Mapped[str] = mapped_column(String(7), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    # The avatar's color, see CLASSROOM_COLORS.
    color: Mapped[str] = mapped_column(String(10), default=DEFAULT_CLASSROOM_COLOR, server_default=DEFAULT_CLASSROOM_COLOR)

    enrollments: Mapped[list["EnrollmentModel"]] = relationship(
        back_populates="classroom", cascade="all, delete-orphan"
    )


class EnrollmentModel(Base):
    __tablename__ = "enrollments"
    __table_args__ = (
        UniqueConstraint("student_id", "classroom_id", name="uq_enrollment_student_classroom"),
        Index("ix_enrollments_classroom_status", "classroom_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), index=True)
    classroom_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("classrooms.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(20))
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    classroom: Mapped[ClassroomModel] = relationship(back_populates="enrollments")
