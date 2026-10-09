"""A kid playing a lesson: its pages, its activity and the extras for them,
keeping how far they got and every try (HU-46, HU-47). Only for students,
and only in published lessons of their classes."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.deps import get_progress_service, require_role
from app.api.mappers import lesson_progress_response, play_lesson_response
from app.api.schemas import (
    AnswerCheckRequest,
    AnswerCheckResponse,
    AttemptRequest,
    AttemptResponse,
    LessonProgressResponse,
    PageProgressResponse,
    PlayLessonResponse,
    ReachPageRequest,
)
from app.application.progress_service import ProgressService
from app.correlation import get_correlation_id
from app.domain.entities import ValidatedUser

router = APIRouter(tags=["progress"])

StudentUser = Annotated[ValidatedUser, Depends(require_role("student"))]
Service = Annotated[ProgressService, Depends(get_progress_service)]


@router.get("/lessons/{lesson_id}/play", response_model=PlayLessonResponse)
async def play_lesson(lesson_id: UUID, user: StudentUser, service: Service) -> PlayLessonResponse:
    """The lesson to play: its pages, its questions (never which answer is
    right), the extras for this kid, and how far they already got."""
    played = await service.play(lesson_id, user, get_correlation_id())
    return play_lesson_response(played)


@router.put("/lessons/{lesson_id}/progress", response_model=PageProgressResponse)
async def reach_page(
    lesson_id: UUID, payload: ReachPageRequest, user: StudentUser, service: Service
) -> PageProgressResponse:
    """The kid is on this page of the lesson or of an extra: it's where they
    come back to. The furthest page (their progress) never goes back."""
    saved = await service.reach_page(lesson_id, user, payload.extra_id, payload.page, get_correlation_id())
    return PageProgressResponse(extra_id=saved.extra_id, pages_seen=saved.pages_seen, last_page=saved.last_page)


@router.post("/lessons/{lesson_id}/answer-checks", response_model=AnswerCheckResponse)
async def check_answer(
    lesson_id: UUID, payload: AnswerCheckRequest, user: StudentUser, service: Service
) -> AnswerCheckResponse:
    """Whether one answer is right, to show it right away. Never says which
    option was the right one, and keeps nothing: the try counts when it's
    sent whole. 409 actividad_cambio if the question or option is gone."""
    correct = await service.check_answer(
        lesson_id, user, payload.extra_id, payload.question_id, payload.option_id, get_correlation_id()
    )
    return AnswerCheckResponse(correct=correct)


@router.post("/lessons/{lesson_id}/attempts", response_model=AttemptResponse, status_code=status.HTTP_201_CREATED)
async def submit_attempt(lesson_id: UUID, payload: AttemptRequest, user: StudentUser, service: Service) -> AttemptResponse:
    """Grades a try at the activity of the lesson or of an extra and keeps
    it. 409 actividad_cambio if the answers don't match the activity now."""
    answers = {a.question_id: a.option_id for a in payload.answers}
    result = await service.submit_attempt(lesson_id, user, payload.extra_id, answers, get_correlation_id())
    a = result.attempt
    return AttemptResponse(
        id=a.id, correct=a.correct, total=a.total, passed=a.passed, created_at=a.created_at, results=result.results
    )


@router.get("/classrooms/{classroom_id}/progress", response_model=list[LessonProgressResponse])
async def my_progress(classroom_id: UUID, user: StudentUser, service: Service) -> list[LessonProgressResponse]:
    """The kid's own progress in one of their classes: every published lesson
    in order, how far they got and their tries, like their family sees it."""
    lessons = await service.my_progress(classroom_id, user, get_correlation_id())
    return [lesson_progress_response(lesson) for lesson in lessons]
