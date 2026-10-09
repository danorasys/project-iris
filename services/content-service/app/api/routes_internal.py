"""Internal routes, only for other IRIS services. They need X-Internal-Key
and the gateway doesn't expose them."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from dataclasses import asdict

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_lesson_service, get_progress_service, verify_internal_key
from app.api.mappers import lesson_progress_response
from app.api.schemas import (
    ClassStatisticsOut,
    EraseStudentsRequest,
    EraseStudentsResponse,
    LessonProgressResponse,
    PublishedLessonsResponse,
)
from app.application.lesson_service import LessonService
from app.application.progress_service import ProgressService
from app.domain.entities import PublishedContent

router = APIRouter(prefix="/internal", tags=["internal"], dependencies=[Depends(verify_internal_key)])


@router.get("/classrooms/published-lessons", response_model=list[PublishedLessonsResponse])
async def published_lessons(
    lessons: Annotated[LessonService, Depends(get_lesson_service)],
    classroom_id: Annotated[list[UUID], Query(max_length=100)],
) -> list[PublishedLessonsResponse]:
    """classroom-service asks this for the classes of a guardian's kids:
    the published lessons of each classroom and the units they're in, 0
    when it has none yet."""
    counts = await lessons.published_counts(classroom_id)
    empty = PublishedContent()
    return [
        PublishedLessonsResponse(
            classroom_id=c,
            published_lessons=counts.get(c, empty).lessons,
            published_units=counts.get(c, empty).units,
        )
        for c in classroom_id
    ]


@router.delete("/classrooms/{classroom_id}/lessons", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_classroom_lessons(
    classroom_id: UUID, lessons: Annotated[LessonService, Depends(get_lesson_service)]
) -> None:
    """classroom-service calls this before deleting a classroom: every lesson
    of it goes, with its blocks and images. 204 also when it had none."""
    await lessons.delete_classroom_lessons(classroom_id)


@router.get("/classrooms/{classroom_id}/students/{student_id}/progress", response_model=list[LessonProgressResponse])
async def student_progress(
    classroom_id: UUID, student_id: UUID, progress: Annotated[ProgressService, Depends(get_progress_service)]
) -> list[LessonProgressResponse]:
    """classroom-service asks this for the parents' portal (HU-46, HU-47),
    after checking the guardian and that the kid is in the class: every
    published lesson in order, with how far the kid got and their tries."""
    lessons = await progress.classroom_progress(classroom_id, student_id)
    return [lesson_progress_response(lesson) for lesson in lessons]


@router.get("/classrooms/{classroom_id}/statistics", response_model=ClassStatisticsOut)
async def classroom_statistics(
    classroom_id: UUID,
    progress: Annotated[ProgressService, Depends(get_progress_service)],
    student_id: Annotated[list[UUID], Query(max_length=500)] = [],  # noqa: B006, FastAPI copies it
) -> ClassStatisticsOut:
    """classroom-service asks this for the teacher (HU-86, HU-87), with the
    kids that are in the class: how far each one got in every published
    lesson, who passed, and the totals of the class."""
    stats = await progress.classroom_statistics(classroom_id, list(dict.fromkeys(student_id)))
    return ClassStatisticsOut.model_validate(asdict(stats))


@router.post("/erasures/students", response_model=EraseStudentsResponse)
async def erase_students(
    payload: EraseStudentsRequest, progress: Annotated[ProgressService, Depends(get_progress_service)]
) -> EraseStudentsResponse:
    """identity-service asks this before deleting a guardian (HU-91): the
    pages, the tries and the extras of their kids go. Asking again finds none."""
    deleted = await progress.erase_kids(list(dict.fromkeys(payload.student_ids)))
    return EraseStudentsResponse(rows_deleted=deleted)
