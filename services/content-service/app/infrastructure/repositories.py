from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domain.entities import ContentBlock, Lesson
from app.infrastructure.models import ContentBlockModel, LessonModel


def _block_to_entity(m: ContentBlockModel) -> ContentBlock:
    return ContentBlock(
        id=m.id,
        lesson_id=m.lesson_id,
        type=m.type,
        order_index=m.order_index,
        content=m.content,
        image_url=m.image_url,
    )


def _lesson_to_entity(m: LessonModel, include_blocks: bool = True) -> Lesson:
    blocks = [_block_to_entity(b) for b in sorted(m.blocks, key=lambda b: b.order_index)] if include_blocks else []
    return Lesson(
        id=m.id,
        classroom_id=m.classroom_id,
        teacher_id=m.teacher_id,
        title=m.title,
        order_index=m.order_index,
        status=m.status,
        blocks=blocks,
    )


class SqlAlchemyLessonRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, lesson_id: UUID) -> Lesson | None:
        result = await self._session.execute(
            select(LessonModel).options(selectinload(LessonModel.blocks)).where(LessonModel.id == lesson_id)
        )
        m = result.scalar_one_or_none()
        return _lesson_to_entity(m) if m else None

    async def list_by_classroom(self, classroom_id: UUID, published_only: bool) -> list[Lesson]:
        stmt = select(LessonModel).where(LessonModel.classroom_id == classroom_id)
        if published_only:
            stmt = stmt.where(LessonModel.status == "publicada")
        stmt = stmt.order_by(LessonModel.order_index)
        result = await self._session.execute(stmt)
        # Blocks aren't loaded here. The listing returns Lesson, not LessonDetail.
        return [_lesson_to_entity(m, include_blocks=False) for m in result.scalars().all()]

    async def has_lesson_by_teacher_in_classroom(self, teacher_id: UUID, classroom_id: UUID) -> bool:
        stmt = (
            select(LessonModel.id)
            .where(LessonModel.classroom_id == classroom_id, LessonModel.teacher_id == teacher_id)
            .limit(1)
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def count_by_classroom(self, classroom_id: UUID) -> int:
        stmt = select(func.count()).select_from(LessonModel).where(LessonModel.classroom_id == classroom_id)
        result = await self._session.execute(stmt)
        return int(result.scalar_one())

    async def add(self, lesson: Lesson) -> None:
        self._session.add(
            LessonModel(
                id=lesson.id,
                classroom_id=lesson.classroom_id,
                teacher_id=lesson.teacher_id,
                title=lesson.title,
                order_index=lesson.order_index,
                status=lesson.status,
                blocks=[
                    ContentBlockModel(
                        id=b.id,
                        lesson_id=b.lesson_id,
                        type=b.type,
                        content=b.content,
                        image_url=b.image_url,
                        order_index=b.order_index,
                    )
                    for b in lesson.blocks
                ],
            )
        )

    async def update(self, lesson: Lesson, replace_blocks: bool) -> None:
        result = await self._session.execute(
            select(LessonModel).options(selectinload(LessonModel.blocks)).where(LessonModel.id == lesson.id)
        )
        m = result.scalar_one_or_none()
        if m is None:
            return
        m.title = lesson.title
        m.status = lesson.status
        if replace_blocks:
            m.blocks.clear()
            for b in lesson.blocks:
                m.blocks.append(
                    ContentBlockModel(
                        id=b.id,
                        lesson_id=lesson.id,
                        type=b.type,
                        content=b.content,
                        image_url=b.image_url,
                        order_index=b.order_index,
                    )
                )
