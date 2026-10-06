"""Routes for a lesson: its pages, activity, extras, images and publishing."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Path, Response, UploadFile, status

from app.api.deps import get_lesson_service, require_role
from app.api.mappers import (
    extra_response,
    lesson_detail_response,
    lesson_response,
    to_activity_input,
    to_block_inputs,
)
from app.api.media import media_response
from app.api.schemas import (
    IMAGE_FILE_PATTERN,
    ActivityRequest,
    CreateExtraRequest,
    ExtraResponse,
    ImageUploadResponse,
    LessonDetailResponse,
    LessonResponse,
    UpdateExtraRequest,
    UpdateLessonRequest,
)
from app.application.dtos import ExtraChanges, LessonChanges
from app.application.lesson_service import LessonService
from app.correlation import get_correlation_id
from app.domain.entities import ValidatedUser
from app.domain.exceptions import InvalidFile

router = APIRouter(tags=["lessons"])

TeacherUser = Annotated[ValidatedUser, Depends(require_role("teacher"))]
ReaderUser = Annotated[ValidatedUser, Depends(require_role("teacher", "student"))]
Service = Annotated[LessonService, Depends(get_lesson_service)]
ImageFileName = Annotated[str, Path(pattern=IMAGE_FILE_PATTERN)]

# Only the user's browser may cache the image, never a shared cache.
_IMAGE_CACHE = "private, max-age=3600"


@router.get("/classrooms/{classroom_id}/lessons", response_model=list[LessonResponse])
async def list_lessons(classroom_id: UUID, user: ReaderUser, service: Service) -> list[LessonResponse]:
    """Every lesson of a classroom, without units. A kid only gets the published ones."""
    lessons = await service.list_classroom_lessons(classroom_id, user, get_correlation_id())
    return [lesson_response(lesson) for lesson in lessons]


@router.get("/lessons/{lesson_id}", response_model=LessonDetailResponse)
async def get_lesson(lesson_id: UUID, user: ReaderUser, service: Service) -> LessonDetailResponse:
    """The lesson with its pages. Its teacher also gets the activity, the
    extras and what's missing to publish it; a kid never gets the answers."""
    lesson = await service.get_lesson(lesson_id, user, get_correlation_id())
    return lesson_detail_response(lesson, for_teacher=user.role == "teacher")


@router.patch("/lessons/{lesson_id}", response_model=LessonDetailResponse)
async def update_lesson(
    lesson_id: UUID, payload: UpdateLessonRequest, user: TeacherUser, service: Service
) -> LessonDetailResponse:
    """Its unit, title, purpose, learning goal and, if sent, the whole set of
    pages. A published lesson only saves complete (422 `leccion_incompleta`)."""
    blocks = to_block_inputs(payload.blocks) if payload.blocks is not None else None
    changes = LessonChanges(
        unit_id=payload.unit_id, title=payload.title, purpose=payload.purpose, learning_goal=payload.learning_goal
    )
    lesson = await service.update_lesson(lesson_id, user, changes, blocks)
    return lesson_detail_response(lesson, for_teacher=True)


@router.delete("/lessons/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_lesson(lesson_id: UUID, user: TeacherUser, service: Service) -> None:
    """The lesson with its pages, activity, extras and images (HU-84)."""
    await service.delete_lesson(lesson_id, user)


@router.put("/lessons/{lesson_id}/activity", response_model=LessonDetailResponse)
async def set_activity(
    lesson_id: UUID, payload: ActivityRequest, user: TeacherUser, service: Service
) -> LessonDetailResponse:
    """The lesson's questions, replaced whole (HU-80)."""
    lesson = await service.set_activity(lesson_id, user, to_activity_input(payload))
    return lesson_detail_response(lesson, for_teacher=True)


@router.post("/lessons/{lesson_id}/publish", response_model=LessonDetailResponse)
async def publish_lesson(lesson_id: UUID, user: TeacherUser, service: Service) -> LessonDetailResponse:
    """Publishes it for the kids (HU-81) if nothing is missing; otherwise 422
    `leccion_incompleta` with `details.missing`."""
    lesson = await service.publish(lesson_id, user)
    return lesson_detail_response(lesson, for_teacher=True)


@router.post("/lessons/{lesson_id}/extras", response_model=ExtraResponse, status_code=status.HTTP_201_CREATED)
async def add_extra(
    lesson_id: UUID, payload: CreateExtraRequest, user: TeacherUser, service: Service
) -> ExtraResponse:
    """More content or one more activity, for everyone or some kids (HU-82)."""
    extra = await service.add_extra(
        lesson_id, user, payload.kind, payload.title, payload.for_everyone, payload.student_ids, get_correlation_id()
    )
    return extra_response(extra)


@router.patch("/lessons/{lesson_id}/extras/{extra_id}", response_model=ExtraResponse)
async def update_extra(
    lesson_id: UUID, extra_id: UUID, payload: UpdateExtraRequest, user: TeacherUser, service: Service
) -> ExtraResponse:
    blocks = to_block_inputs(payload.blocks) if payload.blocks is not None else None
    changes = ExtraChanges(title=payload.title, for_everyone=payload.for_everyone, student_ids=payload.student_ids)
    extra = await service.update_extra(lesson_id, extra_id, user, changes, blocks, get_correlation_id())
    return extra_response(extra)


@router.put("/lessons/{lesson_id}/extras/{extra_id}/activity", response_model=ExtraResponse)
async def set_extra_activity(
    lesson_id: UUID, extra_id: UUID, payload: ActivityRequest, user: TeacherUser, service: Service
) -> ExtraResponse:
    extra = await service.set_extra_activity(lesson_id, extra_id, user, to_activity_input(payload))
    return extra_response(extra)


@router.delete("/lessons/{lesson_id}/extras/{extra_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_extra(lesson_id: UUID, extra_id: UUID, user: TeacherUser, service: Service) -> None:
    await service.delete_extra(lesson_id, extra_id, user)


@router.post("/lessons/{lesson_id}/images", response_model=ImageUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_image(
    lesson_id: UUID,
    user: TeacherUser,
    service: Service,
    file: Annotated[UploadFile, File()],
) -> ImageUploadResponse:
    if file.content_type is None:
        raise InvalidFile("El archivo debe ser una imagen.")
    content = await file.read()
    image_file = await service.upload_image(lesson_id, user, file.content_type, content)
    return ImageUploadResponse(image_file=image_file)


@router.get(
    "/lessons/{lesson_id}/images/{file_name}",
    response_class=Response,
    responses={200: {"content": {"image/*": {}}}, 404: {"description": "No existe o no tienes acceso."}},
)
async def get_image(
    lesson_id: UUID,
    file_name: ImageFileName,
    user: ReaderUser,
    service: Service,
) -> Response:
    signed = await service.get_image(lesson_id, file_name, user, get_correlation_id())
    return media_response(signed, _IMAGE_CACHE)
