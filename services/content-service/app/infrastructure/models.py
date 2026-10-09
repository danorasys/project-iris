# SQLAlchemy models.
#
# Uuid(as_uuid=True) is SQLAlchemy 2.0's generic type. It maps to the native
# uuid type on PostgreSQL and to CHAR(32) on SQLite, so the schema doesn't need
# to be duplicated between the two dialects. classroom_id, teacher_id and
# student_id are reference UUIDs with no real foreign key toward another
# database. Integrity there is validated by API, not by the DB engine.
#
# Inside content_db everything hangs from the lesson with real foreign keys
# (ADR 0013). The ORM cascades too, so deleting works the same on SQLite
# (the tests), which doesn't enforce ON DELETE by default.

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.domain.entities import BLOCK_TYPES, EXTRA_KINDS, STATUS_DRAFT
from app.infrastructure.db import Base

_BLOCK_TYPES_SQL = ", ".join(f"'{t}'" for t in BLOCK_TYPES)
_EXTRA_KINDS_SQL = ", ".join(f"'{k}'" for k in EXTRA_KINDS)


def _uuid4() -> uuid.UUID:
    return uuid.uuid4()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UnitModel(Base):
    __tablename__ = "units"
    __table_args__ = (
        Index("ix_units_classroom_order", "classroom_id", "order_index"),
        # the units of one teacher by classroom, for the Inicio (migration 0005)
        Index("ix_units_teacher_classroom", "teacher_id", "classroom_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    classroom_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True))
    teacher_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True))
    title: Mapped[str] = mapped_column(String(120))
    guiding_question: Mapped[str] = mapped_column(String(300))
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class LessonModel(Base):
    __tablename__ = "lessons"
    __table_args__ = (
        # covers list_by_classroom (classroom_id [+ status]) and has_lesson_by_teacher_in_classroom
        Index("ix_lessons_classroom_teacher", "classroom_id", "teacher_id"),
        Index("ix_lessons_classroom_status", "classroom_id", "status"),
        # the lessons of a unit, in their order
        Index("ix_lessons_unit_order", "unit_id", "order_index"),
        # the lessons of one teacher by classroom and status, for the Inicio (0005)
        Index("ix_lessons_teacher_classroom_status", "teacher_id", "classroom_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    # No index=True here: ix_lessons_classroom_teacher already covers lookups by
    # classroom_id alone (leftmost column of the composite), and the counts by
    # teacher use ix_lessons_teacher_classroom_status.
    classroom_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True))
    teacher_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True))
    # RESTRICT: a unit with lessons can't be deleted (UnitNotEmpty).
    unit_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("units.id", ondelete="RESTRICT"))
    title: Mapped[str] = mapped_column(String(200))
    purpose: Mapped[str] = mapped_column(String(200))
    learning_goal: Mapped[str] = mapped_column(String(300))
    # named order_index, not order, to avoid the SQL reserved word.
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default=STATUS_DRAFT)

    # Only the lesson's own blocks; the ones of an extra hang from it.
    blocks: Mapped[list["ContentBlockModel"]] = relationship(
        primaryjoin="and_(LessonModel.id == ContentBlockModel.lesson_id, ContentBlockModel.extra_id.is_(None))",
        cascade="all, delete-orphan",
        order_by="(ContentBlockModel.page_index, ContentBlockModel.order_index)",
        overlaps="blocks",
    )
    activity: Mapped["ActivityModel | None"] = relationship(
        primaryjoin="and_(LessonModel.id == ActivityModel.lesson_id, ActivityModel.extra_id.is_(None))",
        cascade="all, delete-orphan",
        uselist=False,
        overlaps="activity",
    )
    extras: Mapped[list["ExtraModel"]] = relationship(
        cascade="all, delete-orphan",
        order_by="ExtraModel.order_index",
    )


class ContentBlockModel(Base):
    __tablename__ = "content_blocks"
    __table_args__ = (
        Index("ix_content_blocks_lesson_order", "lesson_id", "page_index", "order_index"),
        Index("ix_content_blocks_extra", "extra_id"),
        CheckConstraint(f"type IN ({_BLOCK_TYPES_SQL})", name="ck_content_blocks_type"),
        CheckConstraint("page_index >= 0", name="ck_content_blocks_page_index"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    lesson_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("lessons.id", ondelete="CASCADE")
    )
    extra_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("extras.id", ondelete="CASCADE"), nullable=True
    )
    type: Mapped[str] = mapped_column(String(20))
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_file: Mapped[str | None] = mapped_column(String(64), nullable=True)
    alt_text: Mapped[str | None] = mapped_column(String(200), nullable=True)
    page_index: Mapped[int] = mapped_column(Integer, default=0)
    order_index: Mapped[int] = mapped_column(Integer, default=0)


class ActivityModel(Base):
    __tablename__ = "activities"
    __table_args__ = (
        # One activity of the lesson itself, and one per extra activity.
        Index(
            "uq_activities_lesson_main",
            "lesson_id",
            unique=True,
            postgresql_where=text("extra_id IS NULL"),
            sqlite_where=text("extra_id IS NULL"),
        ),
        Index("uq_activities_extra", "extra_id", unique=True),
        CheckConstraint("pass_threshold >= 1", name="ck_activities_pass_threshold"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    lesson_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("lessons.id", ondelete="CASCADE")
    )
    extra_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("extras.id", ondelete="CASCADE"), nullable=True
    )
    pass_threshold: Mapped[int] = mapped_column(Integer)

    questions: Mapped[list["QuestionModel"]] = relationship(
        cascade="all, delete-orphan", order_by="QuestionModel.order_index"
    )


class QuestionModel(Base):
    __tablename__ = "questions"
    __table_args__ = (Index("ix_questions_activity_order", "activity_id", "order_index"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    activity_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("activities.id", ondelete="CASCADE")
    )
    prompt: Mapped[str] = mapped_column(String(300))
    order_index: Mapped[int] = mapped_column(Integer, default=0)

    options: Mapped[list["QuestionOptionModel"]] = relationship(
        cascade="all, delete-orphan", order_by="QuestionOptionModel.order_index"
    )


class QuestionOptionModel(Base):
    __tablename__ = "question_options"
    __table_args__ = (
        Index("ix_question_options_question_order", "question_id", "order_index"),
        # At most one right answer per question, checked by the database too.
        Index(
            "uq_question_options_one_correct",
            "question_id",
            unique=True,
            postgresql_where=text("is_correct"),
            sqlite_where=text("is_correct"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    question_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("questions.id", ondelete="CASCADE")
    )
    text: Mapped[str] = mapped_column(String(150))
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0)


class ExtraModel(Base):
    __tablename__ = "extras"
    __table_args__ = (
        Index("ix_extras_lesson_order", "lesson_id", "order_index"),
        CheckConstraint(f"kind IN ({_EXTRA_KINDS_SQL})", name="ck_extras_kind"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    lesson_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("lessons.id", ondelete="CASCADE")
    )
    kind: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(120))
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    for_everyone: Mapped[bool] = mapped_column(Boolean, default=True)

    blocks: Mapped[list[ContentBlockModel]] = relationship(
        cascade="all, delete-orphan",
        order_by="(ContentBlockModel.page_index, ContentBlockModel.order_index)",
        overlaps="blocks",
    )
    activity: Mapped[ActivityModel | None] = relationship(
        cascade="all, delete-orphan", uselist=False, overlaps="activity"
    )
    students: Mapped[list["ExtraStudentModel"]] = relationship(cascade="all, delete-orphan")


# How far each kid got in the pages of a lesson (extra_id NULL) or of one of
# its extras. One row per kid and part, see the two unique indexes.
class PageProgressModel(Base):
    __tablename__ = "page_progress"
    __table_args__ = (
        Index(
            "uq_page_progress_lesson",
            "student_id",
            "lesson_id",
            unique=True,
            postgresql_where=text("extra_id IS NULL"),
            sqlite_where=text("extra_id IS NULL"),
        ),
        Index("uq_page_progress_extra", "student_id", "extra_id", unique=True),
        CheckConstraint("pages_seen >= 0", name="ck_page_progress_pages_seen"),
        CheckConstraint("last_page >= 0", name="ck_page_progress_last_page"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True))
    lesson_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("lessons.id", ondelete="CASCADE"))
    extra_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("extras.id", ondelete="CASCADE"), nullable=True
    )
    pages_seen: Mapped[int] = mapped_column(Integer, default=0)
    last_page: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


# Every try of a kid at an activity (HU-47), newest last.
class AttemptModel(Base):
    __tablename__ = "activity_attempts"
    __table_args__ = (
        # A kid's tries in the lessons of a class, in order (the progress page).
        Index("ix_activity_attempts_student_lesson", "student_id", "lesson_id", "created_at"),
        CheckConstraint("total >= 1 AND correct >= 0 AND correct <= total", name="ck_activity_attempts_score"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True))
    lesson_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("lessons.id", ondelete="CASCADE"))
    extra_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("extras.id", ondelete="CASCADE"), nullable=True
    )
    correct: Mapped[int] = mapped_column(Integer)
    total: Mapped[int] = mapped_column(Integer)
    passed: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


# The kids an extra is for, when it isn't for everyone.
class ExtraStudentModel(Base):
    __tablename__ = "extra_students"

    extra_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("extras.id", ondelete="CASCADE"), primary_key=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
