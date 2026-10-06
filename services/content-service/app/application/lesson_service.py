# Lesson use cases: the lesson in its unit, its pages, activity, extras and
# publishing (ADR 0013). Only talks to the ports in app.domain.ports.

from __future__ import annotations

import logging
import uuid
from typing import Callable
from uuid import UUID

from app.application.dtos import ActivityInput, BlockInput, ExtraChanges, LessonChanges
from app.application.image_rules import EXTENSION_BY_CONTENT_TYPE, matches_declared_type
from app.application.lesson_rules import encode_items, encode_rows, missing_to_publish
from app.domain.entities import (
    BLOCK_IMAGE,
    BLOCK_LIST,
    BLOCK_TABLE,
    EXTRA_ACTIVITY,
    EXTRA_CONTENT,
    STATUS_DRAFT,
    STATUS_PUBLISHED,
    Activity,
    ContentBlock,
    Extra,
    Lesson,
    Question,
    QuestionOption,
    SignedDownload,
    Unit,
    ValidatedUser,
)
from app.domain.exceptions import (
    InvalidAudience,
    InvalidFile,
    InvalidOrder,
    LessonIncomplete,
    PermissionDenied,
    ResourceNotFound,
)
from app.domain.ports import ClassroomClient, ObjectStorage, UnitOfWork

logger = logging.getLogger(__name__)

UowFactory = Callable[[], "UnitOfWork"]


def _image_key(lesson_id: UUID, file_name: str) -> str:
    # Each lesson has its own folder, so a block can't point at another lesson's image.
    return f"lessons/{lesson_id}/images/{file_name}"


def _to_blocks(lesson_id: UUID, blocks: list[BlockInput], extra_id: UUID | None) -> list[ContentBlock]:
    result: list[ContentBlock] = []
    for b in blocks:
        content: str | None = b.text
        if b.type == BLOCK_LIST:
            content = encode_items(b.items or [])
        elif b.type == BLOCK_TABLE:
            content = encode_rows(b.rows or [])
        elif b.type == BLOCK_IMAGE:
            content = None
        result.append(
            ContentBlock(
                id=uuid.uuid4(),
                lesson_id=lesson_id,
                type=b.type,
                page_index=b.page_index,
                order_index=b.order_index,
                content=content,
                image_file=b.image_file if b.type == BLOCK_IMAGE else None,
                alt_text=b.alt_text if b.type == BLOCK_IMAGE else None,
                extra_id=extra_id,
            )
        )
    return result


def _to_activity(activity: ActivityInput) -> Activity:
    return Activity(
        id=uuid.uuid4(),
        pass_threshold=activity.pass_threshold,
        questions=[
            Question(
                id=uuid.uuid4(),
                prompt=q.prompt,
                order_index=index,
                options=[
                    QuestionOption(id=uuid.uuid4(), text=o.text, is_correct=o.is_correct, order_index=position)
                    for position, o in enumerate(q.options)
                ],
            )
            for index, q in enumerate(activity.questions)
        ],
    )


def _images_of(lesson: Lesson) -> set[str]:
    blocks = lesson.blocks + [b for extra in lesson.extras for b in extra.blocks]
    return {b.image_file for b in blocks if b.image_file}


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

    # --- helpers -------------------------------------------------------------

    @staticmethod
    def _require_role(user: ValidatedUser, *roles: str) -> None:
        if user.role not in roles:
            raise PermissionDenied("Tu tipo de cuenta no tiene acceso a esta operación.")

    async def _own_lesson(self, uow: UnitOfWork, lesson_id: UUID, user: ValidatedUser) -> Lesson:
        # Only the teacher who wrote it, a local check that doesn't repeat
        # the classroom-service call.
        self._require_role(user, "teacher")
        lesson = await uow.lessons.get_by_id(lesson_id)
        if lesson is None:
            raise ResourceNotFound("La lección solicitada no existe.")
        if lesson.teacher_id != user.subject_id:
            raise PermissionDenied("No eres el autor de esta lección.")
        return lesson

    async def _own_unit(self, uow: UnitOfWork, unit_id: UUID, user: ValidatedUser) -> Unit:
        unit = await uow.units.get_by_id(unit_id)
        if unit is None:
            raise ResourceNotFound("La unidad no existe.")
        if unit.teacher_id != user.subject_id:
            raise PermissionDenied("No eres el docente de esta unidad.")
        return unit

    @staticmethod
    def _find_extra(lesson: Lesson, extra_id: UUID) -> Extra:
        for extra in lesson.extras:
            if extra.id == extra_id:
                return extra
        raise ResourceNotFound("El extra no existe.")

    @staticmethod
    def _keep_complete_if_published(lesson: Lesson) -> None:
        # Kids already see a published lesson, so it can only be saved whole.
        if lesson.status == STATUS_PUBLISHED:
            missing = missing_to_publish(lesson)
            if missing:
                raise LessonIncomplete(
                    "La lección ya está publicada: completa esto antes de guardar.", missing=missing
                )

    async def _check_audience(
        self, classroom_id: UUID, student_ids: list[UUID], correlation_id: str | None
    ) -> None:
        # Every kid of an extra must be a member of the class. Asked to
        # classroom-service one by one (cached), it's a handful at most.
        for student_id in student_ids:
            if not await self._classroom.verify_access(classroom_id, student_id, "student", correlation_id):
                raise InvalidAudience()

    async def _delete_quietly(self, key: str) -> None:
        # If deleting fails it's only wasted space, the lesson is already saved.
        try:
            await self._storage.delete(key)
        except Exception:  # noqa: BLE001, cleaning up storage is never worth failing the request
            logger.warning("No fue posible borrar el archivo %s del almacenamiento.", key)

    async def _delete_unused_images(self, lesson_id: UUID, before: set[str], after: set[str]) -> None:
        # Images the lesson stopped showing are deleted, so the bucket doesn't
        # keep files nobody points at. A fresh upload not yet in a block stays.
        for file_name in before - after:
            await self._delete_quietly(_image_key(lesson_id, file_name))

    # --- reading -------------------------------------------------------------

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
                if not await uow.lessons.has_lesson_by_teacher_in_classroom(user.subject_id, classroom_id):
                    return []
                return await uow.lessons.list_by_classroom(classroom_id, published_only=False)
        if user.role == "student":
            if not await self._classroom.verify_access(classroom_id, user.subject_id, "student", correlation_id):
                raise PermissionDenied("No estás inscrito en esta aula.")
            async with self._uow_factory() as uow:
                return await uow.lessons.list_by_classroom(classroom_id, published_only=True)
        raise PermissionDenied("Tu tipo de cuenta no tiene acceso a esta operación.")

    async def get_lesson(self, lesson_id: UUID, user: ValidatedUser, correlation_id: str | None) -> Lesson:
        # GET /lessons/{lesson_id}. The author always; an enrolled kid only
        # once it's published. What a kid can see of it is decided in api/.
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
            if lesson.status != STATUS_PUBLISHED:
                # "doesn't exist" and "not published" look the same on purpose, so a
                # student can't infer the state of a lesson they can't access.
                raise ResourceNotFound("La lección solicitada no existe.")
        return lesson

    # --- the lesson itself ---------------------------------------------------

    # POST /units/{unit_id}/lessons (HU-78). Created as a draft at the end of
    # its unit, with its title, purpose and learning goal from the start.
    async def create_lesson(
        self, unit_id: UUID, user: ValidatedUser, title: str, purpose: str, learning_goal: str
    ) -> Lesson:
        self._require_role(user, "teacher")
        async with self._uow_factory() as uow:
            unit = await self._own_unit(uow, unit_id, user)
            lesson = Lesson(
                id=uuid.uuid4(),
                classroom_id=unit.classroom_id,
                teacher_id=user.subject_id,
                unit_id=unit.id,
                title=title,
                purpose=purpose,
                learning_goal=learning_goal,
                order_index=await uow.lessons.count_by_unit(unit.id),
                status=STATUS_DRAFT,
            )
            await uow.lessons.add(lesson)
            await uow.commit()
        return lesson

    # PATCH /lessons/{lesson_id}: its fields and, when sent, its pages
    # (the whole set is replaced, that's the editor's contract).
    async def update_lesson(
        self, lesson_id: UUID, user: ValidatedUser, changes: LessonChanges, blocks: list[BlockInput] | None
    ) -> Lesson:
        async with self._uow_factory() as uow:
            lesson = await self._own_lesson(uow, lesson_id, user)
            images_before = _images_of(lesson)

            if changes.unit_id is not None and changes.unit_id != lesson.unit_id:
                unit = await self._own_unit(uow, changes.unit_id, user)
                if unit.classroom_id != lesson.classroom_id:
                    raise PermissionDenied("La unidad es de otra clase.")
                # Moved to the end of its new unit.
                lesson.unit_id = unit.id
                lesson.order_index = await uow.lessons.count_by_unit(unit.id)
            if changes.title is not None:
                lesson.title = changes.title
            if changes.purpose is not None:
                lesson.purpose = changes.purpose
            if changes.learning_goal is not None:
                lesson.learning_goal = changes.learning_goal
            if blocks is not None:
                lesson.blocks = _to_blocks(lesson.id, blocks, None)

            self._keep_complete_if_published(lesson)
            await uow.lessons.update_details(lesson)
            if blocks is not None:
                await uow.lessons.replace_blocks(lesson.id, lesson.blocks, None)
            await uow.commit()

        await self._delete_unused_images(lesson.id, images_before, _images_of(lesson))
        return lesson

    # PUT /lessons/{lesson_id}/activity (HU-80): the questions, replaced whole.
    async def set_activity(self, lesson_id: UUID, user: ValidatedUser, activity: ActivityInput) -> Lesson:
        async with self._uow_factory() as uow:
            lesson = await self._own_lesson(uow, lesson_id, user)
            lesson.activity = _to_activity(activity)
            self._keep_complete_if_published(lesson)
            await uow.lessons.replace_activity(lesson.id, lesson.activity, None)
            await uow.commit()
        return lesson

    # POST /lessons/{lesson_id}/publish (HU-81). Only when nothing is missing;
    # otherwise 422 with the list of what is.
    async def publish(self, lesson_id: UUID, user: ValidatedUser) -> Lesson:
        async with self._uow_factory() as uow:
            lesson = await self._own_lesson(uow, lesson_id, user)
            missing = missing_to_publish(lesson)
            if missing:
                raise LessonIncomplete(missing=missing)
            lesson.status = STATUS_PUBLISHED
            await uow.lessons.update_details(lesson)
            await uow.commit()
        return lesson

    # PUT /units/{unit_id}/lessons/order: names every lesson of the unit once.
    async def reorder_lessons(self, unit_id: UUID, user: ValidatedUser, lesson_ids: list[UUID]) -> list[Lesson]:
        self._require_role(user, "teacher")
        async with self._uow_factory() as uow:
            unit = await self._own_unit(uow, unit_id, user)
            lessons = [
                lesson
                for lesson in await uow.lessons.list_by_classroom(unit.classroom_id, published_only=False)
                if lesson.unit_id == unit.id
            ]
            if len(lesson_ids) != len(set(lesson_ids)) or set(lesson_ids) != {lesson.id for lesson in lessons}:
                raise InvalidOrder()
            position = {lesson_id: index for index, lesson_id in enumerate(lesson_ids)}
            for lesson in lessons:
                lesson.order_index = position[lesson.id]
                await uow.lessons.update_details(lesson)
            await uow.commit()
        return sorted(lessons, key=lambda lesson: lesson.order_index)

    # DELETE /lessons/{lesson_id} (HU-84): with its pages, activity, extras
    # and images.
    async def delete_lesson(self, lesson_id: UUID, user: ValidatedUser) -> None:
        async with self._uow_factory() as uow:
            lesson = await self._own_lesson(uow, lesson_id, user)
            await uow.lessons.delete(lesson.id)
            await uow.commit()
        try:
            await self._storage.delete_prefix(f"lessons/{lesson.id}/")
        except Exception:  # noqa: BLE001, cleaning up storage is never worth failing the request
            logger.warning("No fue posible borrar las imágenes de la lección %s.", lesson.id)

    # --- extras (HU-82) ------------------------------------------------------

    async def add_extra(
        self,
        lesson_id: UUID,
        user: ValidatedUser,
        kind: str,
        title: str,
        for_everyone: bool,
        student_ids: list[UUID],
        correlation_id: str | None,
    ) -> Extra:
        async with self._uow_factory() as uow:
            lesson = await self._own_lesson(uow, lesson_id, user)
            if not for_everyone:
                await self._check_audience(lesson.classroom_id, student_ids, correlation_id)
            extra = Extra(
                id=uuid.uuid4(),
                lesson_id=lesson.id,
                kind=kind,
                title=title,
                order_index=len(lesson.extras),
                for_everyone=for_everyone,
                student_ids=[] if for_everyone else sorted(set(student_ids), key=str),
            )
            # It starts empty: the kids won't see it until it's complete.
            await uow.lessons.add_extra(extra)
            await uow.commit()
        return extra

    async def update_extra(
        self,
        lesson_id: UUID,
        extra_id: UUID,
        user: ValidatedUser,
        changes: ExtraChanges,
        blocks: list[BlockInput] | None,
        correlation_id: str | None,
    ) -> Extra:
        async with self._uow_factory() as uow:
            lesson = await self._own_lesson(uow, lesson_id, user)
            extra = self._find_extra(lesson, extra_id)
            images_before = _images_of(lesson)
            if changes.title is not None:
                extra.title = changes.title
            if changes.for_everyone is not None:
                extra.for_everyone = changes.for_everyone
            if changes.student_ids is not None:
                extra.student_ids = sorted(set(changes.student_ids), key=str)
            if extra.for_everyone:
                extra.student_ids = []
            else:
                await self._check_audience(lesson.classroom_id, extra.student_ids, correlation_id)
            if blocks is not None:
                if extra.kind != EXTRA_CONTENT:
                    raise InvalidFile("Este extra es una actividad, no tiene páginas.")
                extra.blocks = _to_blocks(lesson.id, blocks, extra.id)

            await uow.lessons.update_extra(extra)
            if blocks is not None:
                await uow.lessons.replace_blocks(lesson.id, extra.blocks, extra.id)
            await uow.commit()

        await self._delete_unused_images(lesson.id, images_before, _images_of(lesson))
        return extra

    async def set_extra_activity(
        self, lesson_id: UUID, extra_id: UUID, user: ValidatedUser, activity: ActivityInput
    ) -> Extra:
        async with self._uow_factory() as uow:
            lesson = await self._own_lesson(uow, lesson_id, user)
            extra = self._find_extra(lesson, extra_id)
            if extra.kind != EXTRA_ACTIVITY:
                raise InvalidFile("Este extra es de contenido, no tiene preguntas.")
            extra.activity = _to_activity(activity)
            await uow.lessons.replace_activity(lesson.id, extra.activity, extra.id)
            await uow.commit()
        return extra

    async def delete_extra(self, lesson_id: UUID, extra_id: UUID, user: ValidatedUser) -> None:
        async with self._uow_factory() as uow:
            lesson = await self._own_lesson(uow, lesson_id, user)
            extra = self._find_extra(lesson, extra_id)
            images_before = _images_of(lesson)
            lesson.extras = [other for other in lesson.extras if other.id != extra.id]
            await uow.lessons.delete_extra(extra.id)
            # The ones after it move up, so the order has no gaps.
            for other in lesson.extras:
                if other.order_index > extra.order_index:
                    other.order_index -= 1
                    await uow.lessons.update_extra(other)
            await uow.commit()
        await self._delete_unused_images(lesson.id, images_before, _images_of(lesson))

    # --- images ----------------------------------------------------------------

    async def upload_image(self, lesson_id: UUID, user: ValidatedUser, content_type: str, content: bytes) -> str:
        # POST /lessons/{lesson_id}/images. Only the authoring teacher.
        # Uploads to the private bucket and returns the file name to put in a
        # block of the lesson or of one of its extras.
        self._require_role(user, "teacher")
        if content_type not in EXTENSION_BY_CONTENT_TYPE:
            raise InvalidFile("El archivo debe ser una imagen.")
        if not matches_declared_type(content_type, content):
            raise InvalidFile("El archivo no es una imagen válida.")
        if len(content) > self._max_image_bytes:
            raise InvalidFile("La imagen no puede superar 5 MB.")

        async with self._uow_factory() as uow:
            await self._own_lesson(uow, lesson_id, user)

        # The extension comes from the checked type, never from the file name.
        file_name = f"{uuid.uuid4().hex}.{EXTENSION_BY_CONTENT_TYPE[content_type]}"
        await self._storage.upload(_image_key(lesson_id, file_name), content, content_type)
        return file_name

    async def get_image(
        self, lesson_id: UUID, file_name: str, user: ValidatedUser, correlation_id: str | None
    ) -> SignedDownload:
        # Same rule as get_lesson, and a student only gets images the lesson
        # actually shows them. Any "no" is the same 404, so it doesn't reveal what exists.
        try:
            lesson = await self.get_lesson(lesson_id, user, correlation_id)
        except PermissionDenied:
            raise ResourceNotFound("La imagen solicitada no existe.") from None
        if user.role == "student":
            visible = list(lesson.blocks)
            for extra in lesson.extras:
                if extra.for_everyone or user.subject_id in extra.student_ids:
                    visible += extra.blocks
            if not any(b.image_file == file_name for b in visible):
                raise ResourceNotFound("La imagen solicitada no existe.")
        return self._storage.sign_download(_image_key(lesson_id, file_name))

    # --- classroom-service (HU-85) ---------------------------------------------

    # Called by classroom-service before deleting a classroom: every lesson
    # of it, with everything inside, its units and the images of each
    # lesson's folder, also the ones uploaded but never used in a block.
    async def delete_classroom_lessons(self, classroom_id: UUID) -> None:
        async with self._uow_factory() as uow:
            lesson_ids = await uow.lessons.list_ids_by_classroom(classroom_id)
            await uow.lessons.delete_by_classroom(classroom_id)
            await uow.units.delete_by_classroom(classroom_id)
            await uow.commit()
        # The rows are gone, so the files can't be reached anymore. A file
        # that fails to go is only wasted space in a private bucket.
        for lesson_id in lesson_ids:
            try:
                await self._storage.delete_prefix(f"lessons/{lesson_id}/")
            except Exception:  # noqa: BLE001, cleaning up storage is never worth failing the request
                logger.warning("No fue posible borrar las imágenes de la lección %s.", lesson_id)
        logger.info("Se borraron %d lecciones del aula %s.", len(lesson_ids), classroom_id)
