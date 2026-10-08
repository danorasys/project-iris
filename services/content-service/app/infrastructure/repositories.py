from __future__ import annotations

from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domain.entities import (
    STATUS_PUBLISHED,
    Activity,
    ContentBlock,
    Extra,
    Lesson,
    Question,
    QuestionOption,
    Unit,
)
from app.infrastructure.models import (
    ActivityModel,
    ContentBlockModel,
    ExtraModel,
    ExtraStudentModel,
    LessonModel,
    QuestionModel,
    QuestionOptionModel,
    UnitModel,
)

# --- model → entity ------------------------------------------------------------


def _block_to_entity(m: ContentBlockModel) -> ContentBlock:
    return ContentBlock(
        id=m.id,
        lesson_id=m.lesson_id,
        type=m.type,
        order_index=m.order_index,
        page_index=m.page_index,
        content=m.content,
        image_file=m.image_file,
        alt_text=m.alt_text,
        extra_id=m.extra_id,
    )


def _activity_to_entity(m: ActivityModel | None) -> Activity | None:
    if m is None:
        return None
    return Activity(
        id=m.id,
        pass_threshold=m.pass_threshold,
        questions=[
            Question(
                id=q.id,
                prompt=q.prompt,
                order_index=q.order_index,
                options=[
                    QuestionOption(id=o.id, text=o.text, is_correct=o.is_correct, order_index=o.order_index)
                    for o in q.options
                ],
            )
            for q in m.questions
        ],
    )


def _extra_to_entity(m: ExtraModel) -> Extra:
    return Extra(
        id=m.id,
        lesson_id=m.lesson_id,
        kind=m.kind,
        title=m.title,
        order_index=m.order_index,
        for_everyone=m.for_everyone,
        student_ids=sorted((s.student_id for s in m.students), key=str),
        blocks=[_block_to_entity(b) for b in m.blocks],
        activity=_activity_to_entity(m.activity),
    )


def _lesson_to_entity(m: LessonModel, with_parts: bool) -> Lesson:
    return Lesson(
        id=m.id,
        classroom_id=m.classroom_id,
        teacher_id=m.teacher_id,
        unit_id=m.unit_id,
        title=m.title,
        purpose=m.purpose,
        learning_goal=m.learning_goal,
        order_index=m.order_index,
        status=m.status,
        blocks=[_block_to_entity(b) for b in m.blocks] if with_parts else [],
        activity=_activity_to_entity(m.activity) if with_parts else None,
        extras=[_extra_to_entity(e) for e in m.extras] if with_parts else [],
    )


def _unit_to_entity(m: UnitModel) -> Unit:
    return Unit(
        id=m.id,
        classroom_id=m.classroom_id,
        teacher_id=m.teacher_id,
        title=m.title,
        guiding_question=m.guiding_question,
        order_index=m.order_index,
    )


# --- entity → model --------------------------------------------------------------


def _block_model(block: ContentBlock, lesson_id: UUID, extra_id: UUID | None) -> ContentBlockModel:
    return ContentBlockModel(
        id=block.id,
        lesson_id=lesson_id,
        extra_id=extra_id,
        type=block.type,
        content=block.content,
        image_file=block.image_file,
        alt_text=block.alt_text,
        page_index=block.page_index,
        order_index=block.order_index,
    )


def _activity_model(activity: Activity, lesson_id: UUID, extra_id: UUID | None) -> ActivityModel:
    return ActivityModel(
        id=activity.id,
        lesson_id=lesson_id,
        extra_id=extra_id,
        pass_threshold=activity.pass_threshold,
        questions=[
            QuestionModel(
                id=q.id,
                prompt=q.prompt,
                order_index=q.order_index,
                options=[
                    QuestionOptionModel(id=o.id, text=o.text, is_correct=o.is_correct, order_index=o.order_index)
                    for o in q.options
                ],
            )
            for q in activity.questions
        ],
    )


# Everything of a lesson in a few SELECTs (one per level), never one per row.
_FULL_LESSON = (
    selectinload(LessonModel.blocks),
    selectinload(LessonModel.activity).selectinload(ActivityModel.questions).selectinload(QuestionModel.options),
    selectinload(LessonModel.extras).options(
        selectinload(ExtraModel.blocks),
        selectinload(ExtraModel.students),
        selectinload(ExtraModel.activity).selectinload(ActivityModel.questions).selectinload(QuestionModel.options),
    ),
)


class SqlAlchemyUnitRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, unit_id: UUID) -> Unit | None:
        m = await self._session.get(UnitModel, unit_id)
        return _unit_to_entity(m) if m else None

    async def list_by_classroom(self, classroom_id: UUID) -> list[Unit]:
        result = await self._session.execute(
            select(UnitModel).where(UnitModel.classroom_id == classroom_id).order_by(UnitModel.order_index)
        )
        return [_unit_to_entity(m) for m in result.scalars().all()]

    async def count_by_classroom(self, classroom_id: UUID) -> int:
        result = await self._session.execute(
            select(func.count()).select_from(UnitModel).where(UnitModel.classroom_id == classroom_id)
        )
        return int(result.scalar_one())

    # ix_units_teacher_classroom serves it.
    async def count_by_teacher(self, teacher_id: UUID) -> dict[UUID, int]:
        result = await self._session.execute(
            select(UnitModel.classroom_id, func.count())
            .where(UnitModel.teacher_id == teacher_id)
            .group_by(UnitModel.classroom_id)
        )
        return {classroom_id: int(count) for classroom_id, count in result.all()}

    async def add(self, unit: Unit) -> None:
        self._session.add(
            UnitModel(
                id=unit.id,
                classroom_id=unit.classroom_id,
                teacher_id=unit.teacher_id,
                title=unit.title,
                guiding_question=unit.guiding_question,
                order_index=unit.order_index,
            )
        )

    async def update(self, unit: Unit) -> None:
        m = await self._session.get(UnitModel, unit.id)
        if m is not None:
            m.title = unit.title
            m.guiding_question = unit.guiding_question
            m.order_index = unit.order_index

    async def delete(self, unit_id: UUID) -> None:
        await self._session.execute(delete(UnitModel).where(UnitModel.id == unit_id))

    async def delete_by_classroom(self, classroom_id: UUID) -> None:
        await self._session.execute(delete(UnitModel).where(UnitModel.classroom_id == classroom_id))


class SqlAlchemyLessonRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def _load(self, lesson_id: UUID) -> LessonModel | None:
        result = await self._session.execute(select(LessonModel).options(*_FULL_LESSON).where(LessonModel.id == lesson_id))
        return result.scalar_one_or_none()

    async def get_by_id(self, lesson_id: UUID) -> Lesson | None:
        m = await self._load(lesson_id)
        return _lesson_to_entity(m, with_parts=True) if m else None

    async def list_by_classroom(self, classroom_id: UUID, published_only: bool) -> list[Lesson]:
        stmt = select(LessonModel).where(LessonModel.classroom_id == classroom_id)
        if published_only:
            stmt = stmt.where(LessonModel.status == STATUS_PUBLISHED)
        stmt = stmt.order_by(LessonModel.unit_id, LessonModel.order_index)
        result = await self._session.execute(stmt)
        # Only the lessons' own fields: a list never needs their pages.
        return [_lesson_to_entity(m, with_parts=False) for m in result.scalars().all()]

    async def has_lesson_by_teacher_in_classroom(self, teacher_id: UUID, classroom_id: UUID) -> bool:
        stmt = (
            select(LessonModel.id)
            .where(LessonModel.classroom_id == classroom_id, LessonModel.teacher_id == teacher_id)
            .limit(1)
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def count_by_unit(self, unit_id: UUID) -> int:
        result = await self._session.execute(
            select(func.count()).select_from(LessonModel).where(LessonModel.unit_id == unit_id)
        )
        return int(result.scalar_one())

    # ix_lessons_teacher_classroom_status serves it.
    async def count_by_teacher(self, teacher_id: UUID) -> dict[UUID, dict[str, int]]:
        result = await self._session.execute(
            select(LessonModel.classroom_id, LessonModel.status, func.count())
            .where(LessonModel.teacher_id == teacher_id)
            .group_by(LessonModel.classroom_id, LessonModel.status)
        )
        counts: dict[UUID, dict[str, int]] = {}
        for classroom_id, status, count in result.all():
            counts.setdefault(classroom_id, {})[status] = int(count)
        return counts

    # ix_lessons_classroom_status serves it: classroom_id + status.
    async def count_published_by_classrooms(self, classroom_ids: list[UUID]) -> dict[UUID, int]:
        if not classroom_ids:
            return {}
        result = await self._session.execute(
            select(LessonModel.classroom_id, func.count())
            .where(LessonModel.classroom_id.in_(classroom_ids), LessonModel.status == STATUS_PUBLISHED)
            .group_by(LessonModel.classroom_id)
        )
        return {classroom_id: int(count) for classroom_id, count in result.all()}

    async def list_ids_by_classroom(self, classroom_id: UUID) -> list[UUID]:
        result = await self._session.execute(select(LessonModel.id).where(LessonModel.classroom_id == classroom_id))
        return list(result.scalars().all())

    async def add(self, lesson: Lesson) -> None:
        self._session.add(
            LessonModel(
                id=lesson.id,
                classroom_id=lesson.classroom_id,
                teacher_id=lesson.teacher_id,
                unit_id=lesson.unit_id,
                title=lesson.title,
                purpose=lesson.purpose,
                learning_goal=lesson.learning_goal,
                order_index=lesson.order_index,
                status=lesson.status,
            )
        )

    # The lesson's own fields, never its pages, activity or extras.
    async def update_details(self, lesson: Lesson) -> None:
        m = await self._session.get(LessonModel, lesson.id)
        if m is None:
            return
        m.unit_id = lesson.unit_id
        m.title = lesson.title
        m.purpose = lesson.purpose
        m.learning_goal = lesson.learning_goal
        m.order_index = lesson.order_index
        m.status = lesson.status

    # Replaces the pages of the lesson (extra_id None) or of one extra.
    async def replace_blocks(self, lesson_id: UUID, blocks: list[ContentBlock], extra_id: UUID | None) -> None:
        owner = ContentBlockModel.extra_id.is_(None) if extra_id is None else ContentBlockModel.extra_id == extra_id
        await self._session.execute(delete(ContentBlockModel).where(ContentBlockModel.lesson_id == lesson_id, owner))
        self._session.add_all(_block_model(b, lesson_id, extra_id) for b in blocks)

    # Replaces the activity of the lesson (extra_id None) or of one extra.
    async def replace_activity(self, lesson_id: UUID, activity: Activity, extra_id: UUID | None) -> None:
        owner = ActivityModel.extra_id.is_(None) if extra_id is None else ActivityModel.extra_id == extra_id
        result = await self._session.execute(
            select(ActivityModel)
            .options(selectinload(ActivityModel.questions).selectinload(QuestionModel.options))
            .where(ActivityModel.lesson_id == lesson_id, owner)
        )
        old = result.scalar_one_or_none()
        if old is not None:
            # Through the ORM, so its questions and options go too, and
            # flushed now, so the new one doesn't clash with it.
            await self._session.delete(old)
            await self._session.flush()
        self._session.add(_activity_model(activity, lesson_id, extra_id))

    async def add_extra(self, extra: Extra) -> None:
        self._session.add(
            ExtraModel(
                id=extra.id,
                lesson_id=extra.lesson_id,
                kind=extra.kind,
                title=extra.title,
                order_index=extra.order_index,
                for_everyone=extra.for_everyone,
                students=[ExtraStudentModel(student_id=s) for s in extra.student_ids],
            )
        )

    # Title, order and who it's for. Its pages or activity have their own calls.
    async def update_extra(self, extra: Extra) -> None:
        result = await self._session.execute(
            select(ExtraModel).options(selectinload(ExtraModel.students)).where(ExtraModel.id == extra.id)
        )
        m = result.scalar_one_or_none()
        if m is None:
            return
        m.title = extra.title
        m.order_index = extra.order_index
        m.for_everyone = extra.for_everyone
        m.students.clear()
        await self._session.flush()
        m.students.extend(ExtraStudentModel(student_id=s) for s in extra.student_ids)

    async def delete_extra(self, extra_id: UUID) -> None:
        result = await self._session.execute(
            select(ExtraModel)
            .options(
                selectinload(ExtraModel.blocks),
                selectinload(ExtraModel.students),
                selectinload(ExtraModel.activity).selectinload(ActivityModel.questions).selectinload(QuestionModel.options),
            )
            .where(ExtraModel.id == extra_id)
        )
        m = result.scalar_one_or_none()
        if m is not None:
            await self._session.delete(m)

    async def delete(self, lesson_id: UUID) -> None:
        # Through the ORM, so its pages, activity and extras go with it on
        # every database (SQLite in the tests doesn't do ON DELETE CASCADE).
        m = await self._load(lesson_id)
        if m is not None:
            await self._session.delete(m)

    async def delete_by_classroom(self, classroom_id: UUID) -> None:
        for lesson_id in await self.list_ids_by_classroom(classroom_id):
            await self.delete(lesson_id)
        await self._session.flush()
