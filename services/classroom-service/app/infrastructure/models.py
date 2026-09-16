# SQLAlchemy models.
#
# Uuid(as_uuid=True) is SQLAlchemy 2.0's generic type. It maps to the native
# uuid type on PostgreSQL and to CHAR(32) on SQLite, so the schema doesn't need
# to be duplicated between the two dialects. teacher_id and student_id are
# reference UUIDs pointing at identity_db, with no real ForeignKey across
# databases.

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.db import Base


def _uuid4() -> uuid.UUID:
    return uuid.uuid4()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ClassroomModel(Base):
    __tablename__ = "classrooms"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    teacher_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(1000))
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    enrollment_code: Mapped[str] = mapped_column(String(7), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

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
