"""Internal routes, only for other IRIS services. They need X-Internal-Key
and the gateway doesn't expose them."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_lesson_service, verify_internal_key
from app.api.schemas import PublishedLessonsResponse
from app.application.lesson_service import LessonService

router = APIRouter(prefix="/internal", tags=["internal"], dependencies=[Depends(verify_internal_key)])


@router.get("/classrooms/published-lessons", response_model=list[PublishedLessonsResponse])
async def published_lessons(
    lessons: Annotated[LessonService, Depends(get_lesson_service)],
    classroom_id: Annotated[list[UUID], Query(max_length=100)],
) -> list[PublishedLessonsResponse]:
    """classroom-service asks this for the classes of a guardian's kids:
    the published lessons of each classroom, 0 when it has none yet."""
    counts = await lessons.published_counts(classroom_id)
    return [PublishedLessonsResponse(classroom_id=c, published_lessons=counts.get(c, 0)) for c in classroom_id]


@router.delete("/classrooms/{classroom_id}/lessons", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_classroom_lessons(
    classroom_id: UUID, lessons: Annotated[LessonService, Depends(get_lesson_service)]
) -> None:
    """classroom-service calls this before deleting a classroom: every lesson
    of it goes, with its blocks and images. 204 also when it had none."""
    await lessons.delete_classroom_lessons(classroom_id)
