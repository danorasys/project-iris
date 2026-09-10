"""Lesson and content block use cases.

Pure orchestration. No direct FastAPI, SQLAlchemy, httpx or boto3 imports,
only the ports defined in app.domain.ports.
"""

from __future__ import annotations

import uuid
from typing import Callable
from uuid import UUID

from app.application.dtos import ContentBlockInput
from app.domain.entities import ContentBlock, Lesson, ValidatedUser
from app.domain.exceptions import InvalidFile, PermissionDenied, ResourceNotFound
from app.domain.ports import ClassroomClient, ObjectStorage, UnitOfWork

UowFactory = Callable[[], "UnitOfWork"]

# SVG technically starts with "image/" but can carry a <script> tag, and it
# gets served back with the same content type, so it's excluded on purpose.
_ALLOWED_IMAGE_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}


class LessonService:
    def __init__(
        self,
        uow_factory: UowFactory,
        classroom_client: ClassroomClient,
        object_storage: ObjectStorage,
        max_image_bytes: int = 5 * 1024 * 1024,
    ) -> None:
        self._uow_factory = uow_factory
        self._classroom = classroom_client
        self._storage = object_storage
        self._max_image_bytes = max_image_bytes

    async def create_lesson(
        self,
        classroom_id: UUID,
        user: ValidatedUser,
        title: str,
        blocks: list[ContentBlockInput],
        correlation_id: str | None,
    ) -> Lesson:
        """POST /classrooms/{classroom_id}/lessons. Only the teacher who owns the
        classroom, verified against classroom-service, fail-closed to 403."""
        self._require_role(user, "teacher")
        authorized = await self._classroom.verify_access(classroom_id, user.subject_id, "teacher", correlation_id)
        if not authorized:
            raise PermissionDenied("No eres el docente dueño de esta aula.")

        lesson_id = uuid.uuid4()
        block_entities = [
            ContentBlock(
                id=uuid.uuid4(),
                lesson_id=lesson_id,
                type=b.type,
                order_index=b.order_index,
                content=b.content,
                image_url=b.image_url,
            )
            for b in blocks
        ]

        async with self._uow_factory() as uow:
            order_index = await uow.lessons.count_by_classroom(classroom_id)
            lesson = Lesson(
                id=lesson_id,
                classroom_id=classroom_id,
                teacher_id=user.subject_id,
                title=title,
                order_index=order_index,
                status="borrador",
                blocks=block_entities,
            )
            await uow.lessons.add(lesson)
            await uow.commit()
        return lesson

    async def list_classroom_lessons(
        self, classroom_id: UUID, user: ValidatedUser, correlation_id: str | None
    ) -> list[Lesson]:
        """GET /classrooms/{classroom_id}/lessons. The owning teacher sees borrador
        and publicada. An enrolled student (verified and cached ~30s) sees only
        publicada."""
        if user.role == "teacher":
            async with self._uow_factory() as uow:
                # If a lesson by this teacher already exists in the classroom, we assume
                # ownership without calling classroom-service. If none exists, there's
                # nothing to protect, so we just return an empty list.
                has_lessons = await uow.lessons.has_lesson_by_teacher_in_classroom(user.subject_id, classroom_id)
                if not has_lessons:
                    return []
                return await uow.lessons.list_by_classroom(classroom_id, published_only=False)
        if user.role == "student":
            authorized = await self._classroom.verify_access(classroom_id, user.subject_id, "student", correlation_id)
            if not authorized:
                raise PermissionDenied("No estás inscrito en esta aula.")
            async with self._uow_factory() as uow:
                return await uow.lessons.list_by_classroom(classroom_id, published_only=True)
        raise PermissionDenied("Tu tipo de cuenta no tiene acceso a esta operación.")

    async def get_lesson(
        self, lesson_id: UUID, user: ValidatedUser, correlation_id: str | None
    ) -> Lesson:
        """GET /lessons/{lesson_id}. Same authorization rule as the listing,
        resolved from lesson.classroom_id."""
        self._require_role(user, "teacher", "student")
        async with self._uow_factory() as uow:
            lesson = await uow.lessons.get_by_id(lesson_id)
        if lesson is None:
            raise ResourceNotFound("La lección solicitada no existe.")

        if user.role == "teacher":
            if lesson.teacher_id != user.subject_id:
                raise PermissionDenied("No eres el autor de esta lección.")
        else:
            authorized = await self._classroom.verify_access(
                lesson.classroom_id, user.subject_id, "student", correlation_id
            )
            if not authorized:
                raise PermissionDenied("No estás inscrito en el aula de esta lección.")
            if lesson.status != "publicada":
                # "doesn't exist" and "not published" look the same on purpose, so a
                # student can't infer the state of a lesson they can't access.
                raise ResourceNotFound("La lección solicitada no existe.")
        return lesson

    async def update_lesson(
        self,
        lesson_id: UUID,
        user: ValidatedUser,
        title: str | None,
        status: str | None,
        blocks: list[ContentBlockInput] | None,
    ) -> Lesson:
        """PATCH /lessons/{lesson_id}. Only the authoring teacher, a local
        check that doesn't repeat the classroom-service call."""
        self._require_role(user, "teacher")
        async with self._uow_factory() as uow:
            lesson = await uow.lessons.get_by_id(lesson_id)
            if lesson is None:
                raise ResourceNotFound("La lección solicitada no existe.")
            if lesson.teacher_id != user.subject_id:
                raise PermissionDenied("No eres el autor de esta lección.")

            if title is not None:
                lesson.title = title
            if status is not None:
                lesson.status = status
            if blocks is not None:
                lesson.blocks = [
                    ContentBlock(
                        id=uuid.uuid4(),
                        lesson_id=lesson.id,
                        type=b.type,
                        order_index=b.order_index,
                        content=b.content,
                        image_url=b.image_url,
                    )
                    for b in blocks
                ]

            await uow.lessons.update(lesson, replace_blocks=blocks is not None)
            await uow.commit()
        return lesson

    async def upload_image(
        self,
        lesson_id: UUID,
        user: ValidatedUser,
        file_name: str,
        content_type: str,
        content: bytes,
    ) -> str:
        """POST /lessons/{lesson_id}/images. Only the authoring teacher, a
        local check. Uploads to S3/MinIO and returns the URL to insert as a
        block via PATCH."""
        self._require_role(user, "teacher")
        if content_type not in _ALLOWED_IMAGE_CONTENT_TYPES:
            raise InvalidFile("El archivo debe ser una imagen.")
        if len(content) > self._max_image_bytes:
            raise InvalidFile("La imagen no puede superar 5 MB.")

        async with self._uow_factory() as uow:
            lesson = await uow.lessons.get_by_id(lesson_id)
        if lesson is None:
            raise ResourceNotFound("La lección solicitada no existe.")
        if lesson.teacher_id != user.subject_id:
            raise PermissionDenied("No eres el autor de esta lección.")

        return await self._storage.upload_image(lesson_id, file_name, content_type, content)

    @staticmethod
    def _require_role(user: ValidatedUser, *roles: str) -> None:
        if user.role not in roles:
            raise PermissionDenied("Tu tipo de cuenta no tiene acceso a esta operación.")
