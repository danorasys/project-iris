# What a kid does in a lesson (HU-46, HU-47): playing it, the pages they
# reach, their tries at the activities, and the summary the parents' portal
# shows. The kid only ever touches their own progress; the summary is asked
# by classroom-service, which already checked the guardian.

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Callable
from uuid import UUID

from app.application import progress_rules as rules
from app.application import statistics_rules
from app.application.dtos import AttemptResult, LessonProgress, PartProgress, PlayableLesson
from app.domain.entities import (
    STATUS_PUBLISHED,
    Activity,
    Attempt,
    Extra,
    Lesson,
    PageProgress,
    ValidatedUser,
)
from app.domain.exceptions import PermissionDenied, ResourceNotFound
from app.domain.ports import ClassroomClient, UnitOfWork

UowFactory = Callable[[], UnitOfWork]

# What the teacher hears about a kid (HU-69), sent by classroom-service.
REPORT_READ = "lesson.content_completed"
REPORT_ACTIVITY = "lesson.activity_completed"

# The kinds of part in a kid's progress. "contenido" and "actividad" are the
# kinds of extra, kept as they're stored.
PART_LESSON = "leccion"


class ProgressService:
    def __init__(self, uow_factory: UowFactory, classroom_client: ClassroomClient) -> None:
        self._uow_factory = uow_factory
        self._classroom = classroom_client

    # A published lesson of a class the kid is in. "Doesn't exist" and "not
    # for you" look the same, like in LessonService.get_lesson.
    async def _lesson_for_kid(self, lesson_id: UUID, user: ValidatedUser, correlation_id: str | None) -> Lesson:
        if user.role != "student":
            raise PermissionDenied("Solo un estudiante avanza en una lección.")
        async with self._uow_factory() as uow:
            lesson = await uow.lessons.get_by_id(lesson_id)
        if lesson is None or lesson.status != STATUS_PUBLISHED:
            raise ResourceNotFound("La lección solicitada no existe.")
        if not await self._classroom.verify_access(lesson.classroom_id, user.subject_id, "student", correlation_id):
            raise ResourceNotFound("La lección solicitada no existe.")
        return lesson

    # The extra must be one the kid gets; any other is the same 404.
    @staticmethod
    def _extra_for_kid(lesson: Lesson, extra_id: UUID, student_id: UUID) -> Extra:
        extra = next((e for e in rules.extras_for(lesson, student_id) if e.id == extra_id), None)
        if extra is None:
            raise ResourceNotFound("El extra solicitado no existe.")
        return extra

    # GET /lessons/{id}/play: the lesson to play, with the extras for this
    # kid and how far they got in each part.
    async def play(self, lesson_id: UUID, user: ValidatedUser, correlation_id: str | None) -> PlayableLesson:
        lesson = await self._lesson_for_kid(lesson_id, user, correlation_id)
        async with self._uow_factory() as uow:
            seen = await uow.progress.pages_of(user.subject_id, [lesson.id])
            attempts = await uow.progress.attempts_of(user.subject_id, [lesson.id])
        return PlayableLesson(
            lesson=lesson,
            extras=rules.extras_for(lesson, user.subject_id),
            pages_seen={p.extra_id: p.pages_seen for p in seen},
            last_page={p.extra_id: p.last_page for p in seen},
            activity_done={a.extra_id for a in attempts},
        )

    # PUT /lessons/{id}/progress: the kid is on this page of the lesson or
    # of an extra. It's where they come back to; the furthest page only
    # moves forward. Never past the last page.
    async def reach_page(
        self, lesson_id: UUID, user: ValidatedUser, extra_id: UUID | None, page: int, correlation_id: str | None
    ) -> PageProgress:
        lesson = await self._lesson_for_kid(lesson_id, user, correlation_id)
        blocks = lesson.blocks if extra_id is None else self._extra_for_kid(lesson, extra_id, user.subject_id).blocks
        total = rules.page_count(blocks)
        page = min(page, total)
        reached = PageProgress(user.subject_id, lesson.id, extra_id, pages_seen=page, last_page=page)
        async with self._uow_factory() as uow:
            before = await uow.progress.get_pages(user.subject_id, lesson.id, extra_id)
            await uow.progress.save_pages(reached)
            await uow.commit()
            saved = await uow.progress.get_pages(user.subject_id, lesson.id, extra_id)
        # The first time the kid gets to the end of the lesson's reading.
        read_before = before is not None and before.pages_seen >= total
        if extra_id is None and total > 0 and page == total and not read_before:
            await self._classroom.report_student(
                lesson.classroom_id, user.subject_id, REPORT_READ, lesson.id, lesson.title, None, correlation_id
            )
        return saved or reached

    # The activity of the lesson or of one of the kid's extras.
    def _activity_of(self, lesson: Lesson, extra_id: UUID | None, student_id: UUID) -> Activity:
        if extra_id is None:
            activity = lesson.activity
        else:
            activity = self._extra_for_kid(lesson, extra_id, student_id).activity
        if activity is None:
            raise ResourceNotFound("Esta parte de la lección no tiene actividad.")
        return activity

    # POST /lessons/{id}/answer-checks: whether one answer is right, so the
    # kid sees it right away (HU-63). Nothing is kept: the try counts only
    # when it's sent whole, so leaving halfway leaves no record.
    async def check_answer(
        self,
        lesson_id: UUID,
        user: ValidatedUser,
        extra_id: UUID | None,
        question_id: UUID,
        option_id: UUID,
        correlation_id: str | None,
    ) -> bool:
        lesson = await self._lesson_for_kid(lesson_id, user, correlation_id)
        return rules.check_answer(self._activity_of(lesson, extra_id, user.subject_id), question_id, option_id)

    # POST /lessons/{id}/attempts: grades a try at the activity of the lesson
    # or of an extra, here and never in the browser, and keeps it.
    async def submit_attempt(
        self,
        lesson_id: UUID,
        user: ValidatedUser,
        extra_id: UUID | None,
        answers: dict[UUID, UUID],
        correlation_id: str | None,
    ) -> AttemptResult:
        lesson = await self._lesson_for_kid(lesson_id, user, correlation_id)
        activity = self._activity_of(lesson, extra_id, user.subject_id)
        results = rules.grade(activity, answers)
        correct = sum(results)
        attempt = Attempt(
            id=uuid.uuid4(),
            student_id=user.subject_id,
            lesson_id=lesson.id,
            extra_id=extra_id,
            correct=correct,
            total=len(results),
            passed=correct >= activity.pass_threshold,
            created_at=datetime.now(timezone.utc),
        )
        async with self._uow_factory() as uow:
            tried_before = any(
                a.extra_id is None for a in await uow.progress.attempts_of(user.subject_id, [lesson.id])
            )
            await uow.progress.add_attempt(attempt)
            await uow.commit()
        # Only the first try at the lesson's activity: the retries would fill
        # the teacher's tray, and every try is in the kid's progress anyway.
        if extra_id is None and not tried_before:
            await self._classroom.report_student(
                lesson.classroom_id,
                user.subject_id,
                REPORT_ACTIVITY,
                lesson.id,
                lesson.title,
                (correct, len(results)),
                correlation_id,
            )
        return AttemptResult(attempt=attempt, results=results)

    # GET /classrooms/{id}/progress: a kid's own progress in one of their
    # classes. A class they're not in looks like one that doesn't exist.
    async def my_progress(
        self, classroom_id: UUID, user: ValidatedUser, correlation_id: str | None
    ) -> list[LessonProgress]:
        if user.role != "student":
            raise PermissionDenied("Solo un estudiante ve su propio progreso.")
        if not await self._classroom.verify_access(classroom_id, user.subject_id, "student", correlation_id):
            raise ResourceNotFound("El aula solicitada no existe.")
        return await self.classroom_progress(classroom_id, user.subject_id)

    # For identity-service, before deleting a guardian (HU-91): everything
    # their kids did in any lesson. Asking again finds nothing.
    async def erase_kids(self, student_ids: list[UUID]) -> int:
        async with self._uow_factory() as uow:
            deleted = await uow.progress.erase_kids(student_ids)
            await uow.commit()
        return deleted

    # For classroom-service (HU-86, HU-87): the statistics of a class for its
    # teacher, with the kids it says are in it. Two queries for the whole
    # class, not one per kid.
    async def classroom_statistics(
        self, classroom_id: UUID, student_ids: list[UUID]
    ) -> statistics_rules.ClassStatistics:
        async with self._uow_factory() as uow:
            lessons = await uow.lessons.list_published_full(classroom_id)
            units = {u.id: u.title for u in await uow.units.list_by_classroom(classroom_id)}
            ids = [lesson.id for lesson in lessons]
            pages = await uow.progress.pages_of_kids(student_ids, ids)
            attempts = await uow.progress.attempts_of_kids(student_ids, ids)
        return statistics_rules.summarize(lessons, units, student_ids, pages, attempts)

    # For classroom-service (HU-46, HU-47): every published lesson of the
    # class in order, with how far the kid got and their tries, for the
    # lesson and each extra the kid gets.
    async def classroom_progress(self, classroom_id: UUID, student_id: UUID) -> list[LessonProgress]:
        async with self._uow_factory() as uow:
            lessons = await uow.lessons.list_published_full(classroom_id)
            units = {u.id: u.title for u in await uow.units.list_by_classroom(classroom_id)}
            ids = [lesson.id for lesson in lessons]
            seen = await uow.progress.pages_of(student_id, ids)
            attempts = await uow.progress.attempts_of(student_id, ids)

        pages_by_part = {(p.lesson_id, p.extra_id): p.pages_seen for p in seen}
        tries_by_part: dict[tuple[UUID, UUID | None], list[Attempt]] = {}
        for attempt in attempts:
            tries_by_part.setdefault((attempt.lesson_id, attempt.extra_id), []).append(attempt)

        def part(lesson: Lesson, extra: Extra | None) -> PartProgress:
            key = (lesson.id, extra.id if extra else None)
            blocks = extra.blocks if extra else lesson.blocks
            has_activity = (extra.activity if extra else lesson.activity) is not None
            tries = tries_by_part.get(key, [])
            total_pages = rules.page_count(blocks)
            pages_seen = min(pages_by_part.get(key, 0), total_pages)
            return PartProgress(
                extra_id=extra.id if extra else None,
                title=extra.title if extra else lesson.title,
                kind=extra.kind if extra else PART_LESSON,
                total_pages=total_pages,
                pages_seen=pages_seen,
                has_activity=has_activity,
                attempts=tries,
                percent=rules.percent_done(pages_seen, total_pages, has_activity, bool(tries)),
            )

        return [
            LessonProgress(
                lesson_id=lesson.id,
                title=lesson.title,
                unit_title=units.get(lesson.unit_id, ""),
                main=part(lesson, None),
                extras=[part(lesson, extra) for extra in rules.extras_for(lesson, student_id)],
            )
            for lesson in lessons
        ]
