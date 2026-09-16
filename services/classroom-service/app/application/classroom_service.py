# Classroom and enrollment use cases.
#
# Pure orchestration. No direct FastAPI, SQLAlchemy, boto3 or redis imports,
# only the ports defined in app.domain.ports.

from __future__ import annotations

import asyncio
import logging
import random
import uuid
from datetime import datetime, timezone
from typing import Callable
from uuid import UUID

from app.application.dtos import (
    ClassroomWithStudents,
    EnrolledStudent,
    EnrichedRequest,
    UpdateClassroomData,
)
from app.domain.entities import STATUS_ACCEPTED, STATUS_PENDING, STATUS_REJECTED, Classroom, Enrollment
from app.domain.exceptions import (
    AlreadyEnrolledOrPending,
    AttemptLimitExceeded,
    ClassroomNotFound,
    EnrollmentNotFound,
    IdentityServiceUnavailable,
    InvalidEnrollmentCode,
    InvalidFile,
    PermissionDenied,
    RequestAlreadyResolved,
    ResourceNotFound,
)
from app.domain.ports import EventPublisher, IdentityGateway, ObjectStorage, RateLimiter, UnitOfWork

logger = logging.getLogger(__name__)

UowFactory = Callable[[], "UnitOfWork"]

REQUESTS_CHANNEL = "classroom.requests"
_MAX_CODE_ATTEMPTS = 25
_MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024
# A fixed list of real image formats, not just anything starting with
# "image/". SVG is deliberately left out, it can carry a <script> tag and
# gets served back with the same content type, which is a stored XSS risk
# if the file is ever opened directly instead of shown inside an <img> tag.
_ALLOWED_LOGO_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}


def _extension_from(content_type: str, filename: str | None) -> str:
    if filename and "." in filename:
        return filename.rsplit(".", 1)[-1].lower()
    return content_type.split("/")[-1].lower() or "bin"


def _generate_enrollment_code() -> str:
    return f"{random.randint(0, 9_999_999):07d}"


class ClassroomService:
    def __init__(
        self,
        uow_factory: UowFactory,
        identity_gateway: IdentityGateway,
        storage: ObjectStorage,
        event_publisher: EventPublisher,
        rate_limiter: RateLimiter,
        rate_limit_enrollment_max: int,
        rate_limit_enrollment_window_sec: int,
    ) -> None:
        self._uow_factory = uow_factory
        self._identity = identity_gateway
        self._storage = storage
        self._events = event_publisher
        self._rate_limiter = rate_limiter
        self._rate_limit_enrollment_max = rate_limit_enrollment_max
        self._rate_limit_enrollment_window_sec = rate_limit_enrollment_window_sec

    # ------------------------------------------------------------------
    # Teacher
    # ------------------------------------------------------------------

    async def create_classroom(self, teacher_id: UUID, name: str, description: str) -> Classroom:
        async with self._uow_factory() as uow:
            code = None
            for _ in range(_MAX_CODE_ATTEMPTS):
                candidate = _generate_enrollment_code()
                if await uow.classrooms.get_by_code(candidate) is None:
                    code = candidate
                    break
            if code is None:
                raise RuntimeError("No fue posible generar un código de ingreso único.")

            classroom = Classroom(
                id=uuid.uuid4(),
                teacher_id=teacher_id,
                name=name,
                description=description,
                enrollment_code=code,
                created_at=datetime.now(timezone.utc),
                logo_url=None,
            )
            await uow.classrooms.add(classroom)
            await uow.commit()
        return classroom

    async def list_teacher_classrooms(self, teacher_id: UUID) -> list[Classroom]:
        async with self._uow_factory() as uow:
            return await uow.classrooms.list_by_teacher(teacher_id)

    async def _get_own_classroom(self, uow: UnitOfWork, classroom_id: UUID, teacher_id: UUID) -> Classroom:
        classroom = await uow.classrooms.get_by_id(classroom_id)
        if classroom is None:
            raise ClassroomNotFound()
        if classroom.teacher_id != teacher_id:
            raise PermissionDenied("No eres el docente dueño de esta aula.")
        return classroom

    async def get_classroom_with_students(self, classroom_id: UUID, teacher_id: UUID) -> ClassroomWithStudents:
        async with self._uow_factory() as uow:
            classroom = await self._get_own_classroom(uow, classroom_id, teacher_id)
            accepted = await uow.enrollments.list_accepted_by_classroom(classroom_id)

        # One call per student to identity-service, but fired all at once
        # instead of one after another, so a classroom with many students
        # doesn't wait on them one by one.
        infos = await asyncio.gather(*(self._identity.obtener_estudiante(e.student_id) for e in accepted))
        students = [
            EnrolledStudent(
                enrollment_id=enrollment.id,
                student_id=enrollment.student_id,
                first_name=info.first_name,
                avatar_id=info.avatar_id,
                status=enrollment.status,
            )
            for enrollment, info in zip(accepted, infos)
        ]
        return ClassroomWithStudents(classroom=classroom, students=students)

    async def update_classroom(self, classroom_id: UUID, teacher_id: UUID, data: UpdateClassroomData) -> Classroom:
        async with self._uow_factory() as uow:
            classroom = await self._get_own_classroom(uow, classroom_id, teacher_id)
            if data.name is not None:
                classroom.name = data.name
            if data.description is not None:
                classroom.description = data.description
            await uow.classrooms.update(classroom)
            await uow.commit()
        return classroom

    async def upload_logo(
        self, classroom_id: UUID, teacher_id: UUID, contenido: bytes, content_type: str, filename: str | None
    ) -> Classroom:
        # Free upload by the teacher, no moderation in the MVP. Validates
        # type and size before touching storage.
        if content_type not in _ALLOWED_LOGO_CONTENT_TYPES:
            raise InvalidFile("El archivo debe ser una imagen PNG, JPEG, WEBP o GIF.")
        if len(contenido) > _MAX_LOGO_SIZE_BYTES:
            raise InvalidFile("La imagen no puede superar 5MB.")

        async with self._uow_factory() as uow:
            classroom = await self._get_own_classroom(uow, classroom_id, teacher_id)

            ext = _extension_from(content_type, filename)
            key = f"classrooms/{classroom_id}/logo/{uuid.uuid4().hex}.{ext}"
            url = await self._storage.subir(key, contenido, content_type)

            classroom.logo_url = url
            await uow.classrooms.update(classroom)
            await uow.commit()
        return classroom

    async def list_requests(self, classroom_id: UUID, teacher_id: UUID) -> list[EnrichedRequest]:
        async with self._uow_factory() as uow:
            await self._get_own_classroom(uow, classroom_id, teacher_id)
            pending = await uow.enrollments.list_pending_by_classroom(classroom_id)

        # Same reasoning as get_classroom_with_students: fetch every
        # student's info at once instead of one request at a time.
        infos = await asyncio.gather(*(self._identity.obtener_estudiante(e.student_id) for e in pending))
        return [
            EnrichedRequest(
                enrollment_id=enrollment.id,
                student_id=enrollment.student_id,
                student_first_name=info.first_name,
                student_avatar_id=info.avatar_id,
                guardian_name=f"{info.guardian_first_name} {info.guardian_last_name}",
                guardian_contact=f"{info.guardian_email} · {info.guardian_phone}",
                requested_at=enrollment.requested_at,
            )
            for enrollment, info in zip(pending, infos)
        ]

    async def resolve_request(
        self, classroom_id: UUID, enrollment_id: UUID, teacher_id: UUID, decision: str
    ) -> Enrollment:
        async with self._uow_factory() as uow:
            classroom = await self._get_own_classroom(uow, classroom_id, teacher_id)
            enrollment = await uow.enrollments.get_by_id(enrollment_id)
            if enrollment is None or enrollment.classroom_id != classroom_id:
                raise EnrollmentNotFound()
            if enrollment.status != STATUS_PENDING:
                raise RequestAlreadyResolved()

            new_status = STATUS_ACCEPTED if decision == "aceptar" else STATUS_REJECTED
            enrollment.status = new_status
            enrollment.resolved_at = datetime.now(timezone.utc)
            await uow.enrollments.update(enrollment)
            await uow.commit()

        await self._publish_event_safely(
            REQUESTS_CHANNEL,
            {
                "event": "request.resolved",
                "classroom_id": str(classroom_id),
                "enrollment_id": str(enrollment_id),
                "decision": new_status,
                "teacher_id": str(classroom.teacher_id),
            },
        )
        return enrollment

    # ------------------------------------------------------------------
    # Student
    # ------------------------------------------------------------------

    async def enroll_in_classroom(self, student_id: UUID, enrollment_code: str) -> Enrollment:
        limit_key = f"enroll:{student_id}"
        if not await self._rate_limiter.permitir(
            limit_key, self._rate_limit_enrollment_max, self._rate_limit_enrollment_window_sec
        ):
            raise AttemptLimitExceeded()

        async with self._uow_factory() as uow:
            classroom = await uow.classrooms.get_by_code(enrollment_code)
            if classroom is None:
                raise InvalidEnrollmentCode()

            existing = await uow.enrollments.get_by_student_and_classroom(student_id, classroom.id)
            if existing is not None and existing.status in (STATUS_PENDING, STATUS_ACCEPTED):
                raise AlreadyEnrolledOrPending()

            now = datetime.now(timezone.utc)
            if existing is not None:
                existing.status = STATUS_PENDING
                existing.requested_at = now
                existing.resolved_at = None
                await uow.enrollments.update(existing)
                enrollment = existing
            else:
                enrollment = Enrollment(
                    id=uuid.uuid4(),
                    student_id=student_id,
                    classroom_id=classroom.id,
                    status=STATUS_PENDING,
                    requested_at=now,
                    resolved_at=None,
                )
                await uow.enrollments.add(enrollment)
            await uow.commit()

        student_name = "Un estudiante"
        try:
            info = await self._identity.obtener_estudiante(student_id)
            student_name = info.first_name
        except (IdentityServiceUnavailable, ResourceNotFound):
            logger.warning("No fue posible resolver el nombre del estudiante para el evento de solicitud.")

        await self._publish_event_safely(
            REQUESTS_CHANNEL,
            {
                "event": "request.created",
                "classroom_id": str(classroom.id),
                "enrollment_id": str(enrollment.id),
                "student_name": student_name,
                "teacher_id": str(classroom.teacher_id),
            },
        )
        return enrollment

    async def list_my_classrooms(self, student_id: UUID) -> list[Classroom]:
        async with self._uow_factory() as uow:
            accepted = await uow.enrollments.list_accepted_by_student(student_id)
            classroom_ids = [enrollment.classroom_id for enrollment in accepted]
            return await uow.classrooms.list_by_ids(classroom_ids)

    # ------------------------------------------------------------------
    # Internal (used by content-service - §5.3, §5.2 punto 10)
    # ------------------------------------------------------------------

    async def verify_access(self, classroom_id: UUID, subject_id: UUID, role: str) -> bool:
        async with self._uow_factory() as uow:
            classroom = await uow.classrooms.get_by_id(classroom_id)
            if classroom is None:
                raise ClassroomNotFound()

            if role == "teacher":
                return classroom.teacher_id == subject_id
            if role == "student":
                enrollment = await uow.enrollments.get_by_student_and_classroom(subject_id, classroom_id)
                return enrollment is not None and enrollment.status == STATUS_ACCEPTED
            return False

    # ------------------------------------------------------------------
    # Publishing to Redis is a non-critical side effect. If Redis doesn't
    # respond, the business operation that already got committed to the
    # database shouldn't fail because of it.
    async def _publish_event_safely(self, canal: str, evento: dict[str, object]) -> None:
        try:
            await self._events.publicar(canal, evento)
        except Exception:  # noqa: BLE001, any infra failure here is non-critical
            logger.warning("No fue posible publicar el evento %s en el canal %s.", evento.get("event"), canal)
