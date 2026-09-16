# SQLAlchemy models.
#
# Uuid(as_uuid=True) is SQLAlchemy 2.0's generic type. It maps to the native
# uuid type on PostgreSQL and to CHAR(32) on SQLite, so the schema doesn't need
# to be duplicated between the two dialects. classroom_id and teacher_id are
# reference UUIDs with no real foreign key toward another database. Integrity
# is validated by API, not by the DB engine.

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Index, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.db import Base


def _uuid4() -> uuid.UUID:
    return uuid.uuid4()


class LessonModel(Base):
    __tablename__ = "lessons"
    __table_args__ = (
        # covers list_by_classroom (classroom_id [+ status]) and has_lesson_by_teacher_in_classroom
        Index("ix_lessons_classroom_teacher", "classroom_id", "teacher_id"),
        Index("ix_lessons_classroom_status", "classroom_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    # No index=True here: ix_lessons_classroom_teacher already covers lookups by
    # classroom_id alone (leftmost column of the composite), and teacher_id is
    # never filtered on its own.
    classroom_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True))
    teacher_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True))
    title: Mapped[str] = mapped_column(String(200))
    # named order_index, not order, to avoid the SQL reserved word.
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="borrador")

    blocks: Mapped[list["ContentBlockModel"]] = relationship(
        back_populates="lesson",
        cascade="all, delete-orphan",
        order_by="ContentBlockModel.order_index",
    )


class ContentBlockModel(Base):
    __tablename__ = "content_blocks"
    __table_args__ = (Index("ix_content_blocks_lesson_order", "lesson_id", "order_index"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    lesson_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("lessons.id", ondelete="CASCADE")
    )
    type: Mapped[str] = mapped_column(String(20))
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0)

    lesson: Mapped[LessonModel] = relationship(back_populates="blocks")
