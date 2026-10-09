# SQLAlchemy models. Uuid(as_uuid=True) is uuid on PostgreSQL and CHAR(32)
# on SQLite (the tests). teacher_id and student_id point to identity_db, so
# they have no real foreign key.

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, SmallInteger, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.domain.entities import (
    AREA_OTHER_MAX_LENGTH,
    CLASSROOM_AREAS,
    CLASSROOM_COLORS,
    CLASSROOM_GRADES,
    DEFAULT_CLASSROOM_COLOR,
    OTHER_AREA,
)
from app.infrastructure.db import Base

_COLORS_SQL = ", ".join(f"'{color}'" for color in CLASSROOM_COLORS)
_AREAS_SQL = ", ".join(f"'{area}'" for area in CLASSROOM_AREAS)


def _uuid4() -> uuid.UUID:
    return uuid.uuid4()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ClassroomModel(Base):
    __tablename__ = "classrooms"
    __table_args__ = (
        CheckConstraint(f"color IN ({_COLORS_SQL})", name="ck_classrooms_color"),
        CheckConstraint(f"area IS NULL OR area IN ({_AREAS_SQL})", name="ck_classrooms_area"),
        # The written area goes with "other" and only with it.
        CheckConstraint(f"(area = '{OTHER_AREA}') = (area_other IS NOT NULL)", name="ck_classrooms_area_other"),
        CheckConstraint(
            f"grade IS NULL OR grade BETWEEN {min(CLASSROOM_GRADES)} AND {max(CLASSROOM_GRADES)}",
            name="ck_classrooms_grade",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    teacher_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(2000))
    logo_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    enrollment_code: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    # The avatar's color, see CLASSROOM_COLORS.
    color: Mapped[str] = mapped_column(String(10), default=DEFAULT_CLASSROOM_COLOR, server_default=DEFAULT_CLASSROOM_COLOR)
    # The subject and the grade, see CLASSROOM_AREAS and CLASSROOM_GRADES.
    # The API requires them; NULL is only left for the classrooms created
    # before (HU-100), a later migration makes them NOT NULL.
    area: Mapped[str | None] = mapped_column(String(30), nullable=True)
    area_other: Mapped[str | None] = mapped_column(String(AREA_OTHER_MAX_LENGTH), nullable=True)
    grade: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    # When its teacher left IRIS (HU-92), see migration 0008.
    teacher_left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

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
