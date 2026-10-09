# From domain entities to API responses, and from requests to inputs.
# Shared by the units and lessons routes.

from __future__ import annotations

from app.api.schemas import (
    ActivityRequest,
    ActivityResponse,
    AttemptOut,
    BlockInput,
    BlockResponse,
    ExtraResponse,
    LessonDetailResponse,
    LessonProgressResponse,
    LessonResponse,
    OptionResponse,
    PartProgressResponse,
    PlayActivityResponse,
    PlayExtraResponse,
    PlayLessonResponse,
    PlayOptionResponse,
    PlayQuestionResponse,
    QuestionResponse,
    UnitResponse,
    UnitWithLessonsResponse,
)
from app.application import dtos
from app.application.dtos import LessonProgress, PartProgress, PlayableLesson
from app.application.lesson_rules import decode_items, decode_rows, extra_missing, missing_to_publish
from app.domain.entities import BLOCK_LIST, BLOCK_TABLE, Activity, ContentBlock, Extra, Lesson, Unit


def to_block_inputs(blocks: list[BlockInput]) -> list[dtos.BlockInput]:
    return [
        dtos.BlockInput(
            type=b.type,
            page_index=b.page_index,
            order_index=b.order_index,
            text=b.text,
            items=b.items,
            rows=b.rows,
            image_file=b.image_file,
            alt_text=b.alt_text,
        )
        for b in blocks
    ]


def to_activity_input(activity: ActivityRequest) -> dtos.ActivityInput:
    return dtos.ActivityInput(
        pass_threshold=activity.pass_threshold,
        questions=[
            dtos.QuestionInput(
                prompt=q.prompt, options=[dtos.OptionInput(text=o.text, is_correct=o.is_correct) for o in q.options]
            )
            for q in activity.questions
        ],
    )


def block_response(block: ContentBlock) -> BlockResponse:
    text = block.content if block.type not in (BLOCK_LIST, BLOCK_TABLE) else None
    return BlockResponse(
        id=block.id,
        type=block.type,
        page_index=block.page_index,
        order_index=block.order_index,
        text=text,
        items=decode_items(block.content) if block.type == BLOCK_LIST else None,
        rows=decode_rows(block.content) if block.type == BLOCK_TABLE else None,
        image_file=block.image_file,
        alt_text=block.alt_text,
    )


def _ordered(blocks: list[ContentBlock]) -> list[BlockResponse]:
    return [block_response(b) for b in sorted(blocks, key=lambda b: (b.page_index, b.order_index))]


def activity_response(activity: Activity | None) -> ActivityResponse | None:
    if activity is None:
        return None
    return ActivityResponse(
        pass_threshold=activity.pass_threshold,
        questions=[
            QuestionResponse(
                prompt=q.prompt,
                options=[OptionResponse(text=o.text, is_correct=o.is_correct) for o in q.options],
            )
            for q in sorted(activity.questions, key=lambda q: q.order_index)
        ],
    )


def extra_response(extra: Extra) -> ExtraResponse:
    return ExtraResponse(
        id=extra.id,
        kind=extra.kind,
        title=extra.title,
        order_index=extra.order_index,
        for_everyone=extra.for_everyone,
        student_ids=extra.student_ids,
        blocks=_ordered(extra.blocks),
        activity=activity_response(extra.activity),
        missing=extra_missing(extra),
    )


def lesson_response(lesson: Lesson) -> LessonResponse:
    return LessonResponse(
        id=lesson.id,
        classroom_id=lesson.classroom_id,
        unit_id=lesson.unit_id,
        teacher_id=lesson.teacher_id,
        title=lesson.title,
        purpose=lesson.purpose,
        learning_goal=lesson.learning_goal,
        order_index=lesson.order_index,
        status=lesson.status,
    )


# The teacher gets everything; a kid only the lesson and its pages, never
# the activity with its right answers (phase B gives them their own routes).
def lesson_detail_response(lesson: Lesson, for_teacher: bool) -> LessonDetailResponse:
    base = lesson_response(lesson).model_dump()
    if not for_teacher:
        return LessonDetailResponse(**base, blocks=_ordered(lesson.blocks))
    return LessonDetailResponse(
        **base,
        blocks=_ordered(lesson.blocks),
        activity=activity_response(lesson.activity),
        extras=[extra_response(e) for e in sorted(lesson.extras, key=lambda e: e.order_index)],
        missing=missing_to_publish(lesson),
    )


def unit_response(unit: Unit) -> UnitResponse:
    return UnitResponse(
        id=unit.id,
        classroom_id=unit.classroom_id,
        title=unit.title,
        guiding_question=unit.guiding_question,
        order_index=unit.order_index,
    )


def unit_with_lessons_response(unit: Unit, lessons: list[Lesson]) -> UnitWithLessonsResponse:
    return UnitWithLessonsResponse(**unit_response(unit).model_dump(), lessons=[lesson_response(lesson) for lesson in lessons])


# --- a kid playing a lesson, and their progress ------------------------------------


def play_activity_response(activity: Activity | None) -> PlayActivityResponse | None:
    if activity is None:
        return None
    return PlayActivityResponse(
        pass_threshold=activity.pass_threshold,
        questions=[
            PlayQuestionResponse(
                id=q.id,
                prompt=q.prompt,
                options=[PlayOptionResponse(id=o.id, text=o.text) for o in sorted(q.options, key=lambda o: o.order_index)],
            )
            for q in sorted(activity.questions, key=lambda q: q.order_index)
        ],
    )


def play_lesson_response(played: PlayableLesson) -> PlayLessonResponse:
    lesson = played.lesson
    return PlayLessonResponse(
        **lesson_response(lesson).model_dump(),
        blocks=_ordered(lesson.blocks),
        activity=play_activity_response(lesson.activity),
        extras=[
            PlayExtraResponse(
                id=extra.id,
                kind=extra.kind,
                title=extra.title,
                blocks=_ordered(extra.blocks),
                activity=play_activity_response(extra.activity),
                pages_seen=played.pages_seen.get(extra.id, 0),
                last_page=played.last_page.get(extra.id, 0),
                activity_done=extra.id in played.activity_done,
            )
            for extra in played.extras
        ],
        pages_seen=played.pages_seen.get(None, 0),
        last_page=played.last_page.get(None, 0),
        activity_done=None in played.activity_done,
    )


def _part_response(part: PartProgress) -> PartProgressResponse:
    return PartProgressResponse(
        extra_id=part.extra_id,
        title=part.title,
        kind=part.kind,
        total_pages=part.total_pages,
        pages_seen=part.pages_seen,
        has_activity=part.has_activity,
        attempts=[
            AttemptOut(correct=a.correct, total=a.total, passed=a.passed, created_at=a.created_at) for a in part.attempts
        ],
        percent=part.percent,
    )


def lesson_progress_response(progress: LessonProgress) -> LessonProgressResponse:
    return LessonProgressResponse(
        lesson_id=progress.lesson_id,
        title=progress.title,
        unit_title=progress.unit_title,
        main=_part_response(progress.main),
        extras=[_part_response(extra) for extra in progress.extras],
    )

