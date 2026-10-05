"""Internal routes, only for other IRIS services. They need X-Internal-Key
and the gateway doesn't expose them."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.deps import get_lesson_service, verify_internal_key
from app.application.lesson_service import LessonService

router = APIRouter(prefix="/internal", tags=["internal"], dependencies=[Depends(verify_internal_key)])


@router.delete("/classrooms/{classroom_id}/lessons", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_classroom_lessons(
    classroom_id: UUID, lessons: Annotated[LessonService, Depends(get_lesson_service)]
) -> None:
    """classroom-service calls this before deleting a classroom: every lesson
    of it goes, with its blocks and images. 204 also when it had none."""
    await lessons.delete_classroom_lessons(classroom_id)
