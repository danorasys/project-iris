"""Routes for lessons and their content blocks."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, UploadFile, status

from app.api.deps import get_lesson_service, require_role
from app.api.schemas import (
    ContentBlockResponse,
    CreateLessonRequest,
    ImageUploadResponse,
    LessonDetailResponse,
    LessonResponse,
    UpdateLessonRequest,
)
from app.application.dtos import ContentBlockInput
from app.application.lesson_service import LessonService
from app.correlation import get_correlation_id
from app.domain.entities import Lesson, ValidatedUser
from app.domain.exceptions import InvalidFile

router = APIRouter(tags=["lessons"])

TeacherUser = Annotated[ValidatedUser, Depends(require_role("teacher"))]
ReaderUser = Annotated[ValidatedUser, Depends(require_role("teacher", "student"))]
Service = Annotated[LessonService, Depends(get_lesson_service)]


def _to_block_inputs(blocks: list) -> list[ContentBlockInput]:
    return [ContentBlockInput(type=b.type, order_index=b.order_index, content=b.content, image_url=b.image_url) for b in blocks]


def _to_lesson_response(lesson: Lesson) -> LessonResponse:
    return LessonResponse(
        id=lesson.id,
        classroom_id=lesson.classroom_id,
        teacher_id=lesson.teacher_id,
        title=lesson.title,
        order_index=lesson.order_index,
        status=lesson.status,
    )


def _to_lesson_detail_response(lesson: Lesson) -> LessonDetailResponse:
    return LessonDetailResponse(
        **_to_lesson_response(lesson).model_dump(),
        blocks=[
            ContentBlockResponse(
                id=b.id, lesson_id=b.lesson_id, type=b.type, content=b.content, image_url=b.image_url, order_index=b.order_index
            )
            for b in sorted(lesson.blocks, key=lambda b: b.order_index)
        ],
    )


@router.post("/classrooms/{classroom_id}/lessons", response_model=LessonDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_lesson(
    classroom_id: UUID,
    payload: CreateLessonRequest,
    user: TeacherUser,
    service: Service,
) -> LessonDetailResponse:
    lesson = await service.create_lesson(
        classroom_id, user, payload.title, _to_block_inputs(payload.blocks), get_correlation_id()
    )
    return _to_lesson_detail_response(lesson)


@router.get("/classrooms/{classroom_id}/lessons", response_model=list[LessonResponse])
async def list_lessons(
    classroom_id: UUID,
    user: ReaderUser,
    service: Service,
) -> list[LessonResponse]:
    lessons = await service.list_classroom_lessons(classroom_id, user, get_correlation_id())
    return [_to_lesson_response(lesson) for lesson in lessons]


@router.get("/lessons/{lesson_id}", response_model=LessonDetailResponse)
async def get_lesson(
    lesson_id: UUID,
    user: ReaderUser,
    service: Service,
) -> LessonDetailResponse:
    lesson = await service.get_lesson(lesson_id, user, get_correlation_id())
    return _to_lesson_detail_response(lesson)


@router.patch("/lessons/{lesson_id}", response_model=LessonDetailResponse)
async def update_lesson(
    lesson_id: UUID,
    payload: UpdateLessonRequest,
    user: TeacherUser,
    service: Service,
) -> LessonDetailResponse:
    blocks = _to_block_inputs(payload.blocks) if payload.blocks is not None else None
    lesson = await service.update_lesson(lesson_id, user, payload.title, payload.status, blocks)
    return _to_lesson_detail_response(lesson)


@router.post(
    "/lessons/{lesson_id}/images", response_model=ImageUploadResponse, status_code=status.HTTP_201_CREATED
)
async def upload_image(
    lesson_id: UUID,
    user: TeacherUser,
    service: Service,
    file: Annotated[UploadFile, File()],
) -> ImageUploadResponse:
    if file.content_type is None:
        raise InvalidFile("El archivo debe ser una imagen.")
    content = await file.read()
    url = await service.upload_image(lesson_id, user, file.filename or "imagen", file.content_type, content)
    return ImageUploadResponse(image_url=url)
