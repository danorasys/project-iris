# Lesson and content block use cases.
#
# Pure orchestration. No direct FastAPI, SQLAlchemy, httpx or boto3 imports,
# only the ports defined in app.domain.ports.

from __future__ import annotations

import logging
import uuid
from typing import Callable
from uuid import UUID

from app.application.dtos import ContentBlockInput
from app.application.image_rules import EXTENSION_BY_CONTENT_TYPE, matches_declared_type
from app.domain.entities import ContentBlock, Lesson, SignedDownload, ValidatedUser
from app.domain.exceptions import InvalidFile, PermissionDenied, ResourceNotFound
from app.domain.ports import ClassroomClient, ObjectStorage, UnitOfWork

logger = logging.getLogger(__name__)

UowFactory = Callable[[], "UnitOfWork"]


def _image_key(lesson_id: UUID, file_name: str) -> str:
    # Each lesson has its own folder, so a block can't point at another lesson's image.
    return f"lessons/{lesson_id}/images/{file_name}"


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
        # POST /classrooms/{classroom_id}/lessons. Only the teacher who owns the
        # classroom, verified against classroom-service, fail-closed to 403.
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
                image_file=b.image_file,
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
        # GET /classrooms/{classroom_id}/lessons. The owning teacher sees borrador
        # and publicada. An enrolled student (verified and cached ~30s) sees only
        # publicada.
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
        # GET /lessons/{lesson_id}. Same authorization rule as the listing,
        # resolved from lesson.classroom_id.
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
        # PATCH /lessons/{lesson_id}. Only the authoring teacher, a local
        # check that doesn't repeat the classroom-service call.
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
            images_before = {b.image_file for b in lesson.blocks if b.image_file}
            if blocks is not None:
                lesson.blocks = [
                    ContentBlock(
                        id=uuid.uuid4(),
                        lesson_id=lesson.id,
                        type=b.type,
                        order_index=b.order_index,
                        content=b.content,
                        image_file=b.image_file,
                    )
                    for b in blocks
                ]

            await uow.lessons.update(lesson, replace_blocks=blocks is not None)
            await uow.commit()

        # Images the lesson stopped showing are deleted, so the bucket doesn't
        # keep files nobody points at. Only ones that were in a block before:
        # a fresh upload the teacher hasn't saved yet is left alone.
        if blocks is not None:
            images_after = {b.image_file for b in lesson.blocks if b.image_file}
            for file_name in images_before - images_after:
                await self._delete_quietly(_image_key(lesson.id, file_name))
        return lesson

    async def upload_image(
        self,
        lesson_id: UUID,
        user: ValidatedUser,
        content_type: str,
        content: bytes,
    ) -> str:
        # POST /lessons/{lesson_id}/images. Only the authoring teacher, a
        # local check. Uploads to the private bucket and returns the file
        # name to insert as a block via PATCH.
        self._require_role(user, "teacher")
        if content_type not in EXTENSION_BY_CONTENT_TYPE:
            raise InvalidFile("El archivo debe ser una imagen.")
        if not matches_declared_type(content_type, content):
            raise InvalidFile("El archivo no es una imagen válida.")
        if len(content) > self._max_image_bytes:
            raise InvalidFile("La imagen no puede superar 5 MB.")

        async with self._uow_factory() as uow:
            lesson = await uow.lessons.get_by_id(lesson_id)
        if lesson is None:
            raise ResourceNotFound("La lección solicitada no existe.")
        if lesson.teacher_id != user.subject_id:
            raise PermissionDenied("No eres el autor de esta lección.")

        # The extension comes from the checked type, never from the file name.
        file_name = f"{uuid.uuid4().hex}.{EXTENSION_BY_CONTENT_TYPE[content_type]}"
        await self._storage.upload(_image_key(lesson_id, file_name), content, content_type)
        return file_name

    async def get_image(
        self, lesson_id: UUID, file_name: str, user: ValidatedUser, correlation_id: str | None
    ) -> SignedDownload:
        # Same rule as get_lesson, and a student only gets images the lesson
        # actually shows. Any "no" is the same 404, so it doesn't reveal what exists.
        try:
            lesson = await self.get_lesson(lesson_id, user, correlation_id)
        except PermissionDenied:
            raise ResourceNotFound("La imagen solicitada no existe.") from None
        if user.role == "student" and not any(b.image_file == file_name for b in lesson.blocks):
            raise ResourceNotFound("La imagen solicitada no existe.")

        return self._storage.sign_download(_image_key(lesson_id, file_name))

    async def _delete_quietly(self, key: str) -> None:
        # If deleting fails it's only wasted space, the lesson is already saved.
        try:
            await self._storage.delete(key)
        except Exception:  # noqa: BLE001, cleaning up storage is never worth failing the request
            logger.warning("No fue posible borrar el archivo %s del almacenamiento.", key)

    @staticmethod
    def _require_role(user: ValidatedUser, *roles: str) -> None:
        if user.role not in roles:
            raise PermissionDenied("Tu tipo de cuenta no tiene acceso a esta operación.")
