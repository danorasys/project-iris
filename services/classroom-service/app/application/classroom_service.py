# Classroom and enrollment use cases.
#
# Pure orchestration. No direct FastAPI, SQLAlchemy, boto3 or redis imports,
# only the ports defined in app.domain.ports.

from __future__ import annotations

import asyncio
import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable
from uuid import UUID

from app.application.dtos import (
    ClassroomPreview,
    ClassroomWithStudents,
    EnrolledStudent,
    EnrichedRequest,
    FamilyClassroom,
    FamilyClassroomDetail,
    TeacherClassroom,
    UpdateClassroomData,
)
from app.application.image_rules import EXTENSION_BY_CONTENT_TYPE, matches_declared_type
from app.domain.entities import (
    CODE_DIGITS,
    CODE_LETTERS,
    CODE_SYMBOLS,
    DEFAULT_CLASSROOM_COLOR,
    ENROLLMENT_CODE_LENGTH,
    OTHER_AREA,
    STATUS_ACCEPTED,
    STATUS_PENDING,
    STATUS_REJECTED,
    Classroom,
    Enrollment,
    EnrollmentCounts,
    PublishedContent,
    SignedDownload,
    StudentInfo,
    TeacherPublicProfile,
)
from app.domain.exceptions import (
    AlreadyEnrolledOrPending,
    AttemptLimitExceeded,
    ClassroomNotFound,
    ClassroomWithoutTeacher,
    ContentServiceUnavailable,
    EnrollmentNotFound,
    IdentityServiceUnavailable,
    IncompleteClassroom,
    InvalidEnrollmentCode,
    InvalidFile,
    KidNotInFamily,
    MessageNotSent,
    MissingOtherArea,
    NotInClassroomYet,
    PermissionDenied,
    RequestAlreadyResolved,
    ResourceNotFound,
)
from app.domain.ports import ContentGateway, EventPublisher, IdentityGateway, ObjectStorage, RateLimiter, UnitOfWork

logger = logging.getLogger(__name__)

# A classroom content-service didn't list has nothing published yet.
NOTHING = PublishedContent()

UowFactory = Callable[[], "UnitOfWork"]

REQUESTS_CHANNEL = "classroom.requests"
_MAX_CODE_ATTEMPTS = 25
_MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024


# One letter, one number and one symbol for sure, the rest from all of
# them, then shuffled. secrets, not random: the code is what lets a family in.
def _generate_enrollment_code() -> str:
    every = CODE_LETTERS + CODE_DIGITS + CODE_SYMBOLS
    chars = [secrets.choice(CODE_LETTERS), secrets.choice(CODE_DIGITS), secrets.choice(CODE_SYMBOLS)]
    chars += [secrets.choice(every) for _ in range(ENROLLMENT_CODE_LENGTH - len(chars))]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


# What a family types can come with spaces or in lowercase.
def normalize_code(code: str) -> str:
    return code.strip().upper()


# How many times a guardian can do each thing in a while, from the settings.
@dataclass(frozen=True)
class RateLimits:
    lookup_max: int
    enrollment_max: int
    enrollment_window_sec: int
    message_max: int
    message_window_sec: int


# The area written by the teacher is needed with "other" and dropped with
# any other area, so it never stays behind after changing the area.
def _written_area(area: str, area_other: str | None) -> str | None:
    if area != OTHER_AREA:
        return None
    if not area_other:
        raise MissingOtherArea()
    return area_other


# The conversation of a message (HU-51): a new one gets a fresh id; an answer
# says which one it answers, and notification-service checks it may.
def _thread(thread_id: UUID | None) -> dict[str, object]:
    if thread_id is None:
        return {"thread_id": str(uuid.uuid4())}
    return {"thread_id": str(thread_id), "reply": True}


class ClassroomService:
    def __init__(
        self,
        uow_factory: UowFactory,
        identity_gateway: IdentityGateway,
        storage: ObjectStorage,
        event_publisher: EventPublisher,
        rate_limiter: RateLimiter,
        limits: RateLimits,
        content_gateway: ContentGateway,
    ) -> None:
        self._uow_factory = uow_factory
        self._identity = identity_gateway
        self._content = content_gateway
        self._storage = storage
        self._events = event_publisher
        self._rate_limiter = rate_limiter
        self._limits = limits

    # ------------------------------------------------------------------
    # Teacher
    # ------------------------------------------------------------------

    async def create_classroom(
        self,
        teacher_id: UUID,
        name: str,
        description: str,
        area: str,
        grade: int,
        color: str = DEFAULT_CLASSROOM_COLOR,
        area_other: str | None = None,
    ) -> Classroom:
        area_other = _written_area(area, area_other)
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
                logo_key=None,
                color=color,
                area=area,
                area_other=area_other,
                grade=grade,
            )
            await uow.classrooms.add(classroom)
            await uow.commit()
        return classroom

    # The teacher's classrooms, each with its pending requests and students:
    # the panel adds them up (the notice of HU-69 and the Inicio) with this
    # one call.
    async def list_teacher_classrooms(self, teacher_id: UUID) -> list[TeacherClassroom]:
        async with self._uow_factory() as uow:
            classrooms = await uow.classrooms.list_by_teacher(teacher_id)
            counts = await uow.enrollments.count_by_classrooms([c.id for c in classrooms])
        empty = EnrollmentCounts()
        return [
            TeacherClassroom(
                classroom=c,
                pending_requests=counts.get(c.id, empty).pending,
                student_count=counts.get(c.id, empty).accepted,
            )
            for c in classrooms
        ]

    # The classes of a guardian's kids (parents' portal): the ones they're
    # in and every request with how it went (HU-41), newest first. The kids
    # come from identity-service, so a guardian only ever sees their own.
    # The teacher's name and the lessons are extras: if identity or
    # content-service don't answer, they come back empty and the list shows.
    async def list_family_classrooms(self, guardian_id: UUID) -> list[FamilyClassroom]:
        kids = await self._family_kids(guardian_id)
        if not kids:
            return []
        async with self._uow_factory() as uow:
            enrollments = await uow.enrollments.list_by_students(list(kids))
            classroom_ids = list({e.classroom_id for e in enrollments})
            classrooms = {c.id: c for c in await uow.classrooms.list_by_ids(classroom_ids)}
        enrollments = [e for e in enrollments if e.classroom_id in classrooms]
        if not enrollments:
            return []

        teacher_names, content = await asyncio.gather(
            self._teacher_names(list({c.teacher_id for c in classrooms.values()})),
            self._published_content(list(classrooms)),
        )
        enrollments.sort(key=lambda e: e.requested_at, reverse=True)
        return [
            FamilyClassroom(
                student_id=e.student_id,
                student_first_name=kids[e.student_id],
                enrollment_id=e.id,
                status=e.status,
                requested_at=e.requested_at,
                classroom=classrooms[e.classroom_id],
                teacher_name=teacher_names.get(classrooms[e.classroom_id].teacher_id),
                published_lessons=None if content is None else content.get(e.classroom_id, NOTHING).lessons,
                published_units=None if content is None else content.get(e.classroom_id, NOTHING).units,
                resolved_at=e.resolved_at,
            )
            for e in enrollments
        ]

    # The name of each teacher, asked all at once. One that fails is just
    # left out.
    async def _teacher_names(self, teacher_ids: list[UUID]) -> dict[UUID, str]:
        results = await asyncio.gather(
            *(self._identity.obtener_nombre_docente(t) for t in teacher_ids), return_exceptions=True
        )
        names: dict[UUID, str] = {}
        for teacher_id, result in zip(teacher_ids, results):
            if isinstance(result, str):
                names[teacher_id] = result
            else:
                logger.warning("No se pudo obtener el nombre del docente %s: %s", teacher_id, result)
        return names

    async def _published_content(self, classroom_ids: list[UUID]) -> dict[UUID, PublishedContent] | None:
        try:
            return await self._content.published_content(classroom_ids)
        except ContentServiceUnavailable:
            logger.warning("content-service no respondió: las clases de la familia van sin lecciones.")
            return None

    async def _get_own_classroom(self, uow: UnitOfWork, classroom_id: UUID, teacher_id: UUID) -> Classroom:
        classroom = await uow.classrooms.get_by_id(classroom_id)
        if classroom is None:
            raise ClassroomNotFound()
        if classroom.teacher_id != teacher_id:
            raise PermissionDenied("No eres el docente dueño de esta aula.")
        if not classroom.has_teacher:
            raise ClassroomWithoutTeacher()
        return classroom

    async def get_classroom_with_students(self, classroom_id: UUID, teacher_id: UUID) -> ClassroomWithStudents:
        async with self._uow_factory() as uow:
            classroom = await self._get_own_classroom(uow, classroom_id, teacher_id)
            accepted = await uow.enrollments.list_accepted_by_classroom(classroom_id)

        # One call per student to identity-service, but fired all at once
        # instead of one after another, so a classroom with many students
        # doesn't wait on them one by one. A kid identity-service doesn't
        # have anymore still shows up, without their data, instead of
        # breaking the whole page.
        results = await asyncio.gather(
            *(self._identity.obtener_estudiante(e.student_id) for e in accepted), return_exceptions=True
        )
        students: list[EnrolledStudent] = []
        for enrollment, result in zip(accepted, results):
            if isinstance(result, ResourceNotFound):
                students.append(
                    EnrolledStudent(
                        enrollment_id=enrollment.id,
                        student_id=enrollment.student_id,
                        first_name="Estudiante sin datos",
                        avatar_id=1,
                        status=enrollment.status,
                    )
                )
                continue
            if isinstance(result, BaseException):
                raise result
            info: StudentInfo = result
            students.append(
                EnrolledStudent(
                    enrollment_id=enrollment.id,
                    student_id=enrollment.student_id,
                    first_name=info.first_name,
                    avatar_id=info.avatar_id,
                    status=enrollment.status,
                    guardian_name=info.guardian_name,
                    guardian_email=info.guardian_email,
                    guardian_phone=info.guardian_phone,
                )
            )
        students.sort(key=lambda student: student.first_name.casefold())
        return ClassroomWithStudents(classroom=classroom, students=students)

    async def update_classroom(self, classroom_id: UUID, teacher_id: UUID, data: UpdateClassroomData) -> Classroom:
        async with self._uow_factory() as uow:
            classroom = await self._get_own_classroom(uow, classroom_id, teacher_id)
            if data.name is not None:
                classroom.name = data.name
            if data.description is not None:
                classroom.description = data.description
            if data.color is not None:
                classroom.color = data.color
            if data.area is not None:
                classroom.area = data.area
            if data.grade is not None:
                classroom.grade = data.grade
            # A classroom from before HU-100 can't be saved until it has both.
            if classroom.area is None or classroom.grade is None:
                raise IncompleteClassroom()
            classroom.area_other = _written_area(classroom.area, data.area_other or classroom.area_other)
            await uow.classrooms.update(classroom)
            await uow.commit()
        return classroom

    async def upload_logo(
        self, classroom_id: UUID, teacher_id: UUID, contenido: bytes, content_type: str
    ) -> Classroom:
        # Free upload by the teacher, no moderation in the MVP. Validates
        # type, real content and size before touching storage.
        if content_type not in EXTENSION_BY_CONTENT_TYPE:
            raise InvalidFile("El archivo debe ser una imagen PNG, JPEG, WEBP o GIF.")
        if not matches_declared_type(content_type, contenido):
            raise InvalidFile("El archivo no es una imagen válida.")
        if len(contenido) > _MAX_LOGO_SIZE_BYTES:
            raise InvalidFile("La imagen no puede superar 5MB.")

        async with self._uow_factory() as uow:
            classroom = await self._get_own_classroom(uow, classroom_id, teacher_id)
            old_key = classroom.logo_key
            # The extension comes from the checked type, never from the file name.
            key = f"classrooms/{classroom_id}/logo/{uuid.uuid4().hex}.{EXTENSION_BY_CONTENT_TYPE[content_type]}"
            await self._storage.upload(key, contenido, content_type)

            classroom.logo_key = key
            await uow.classrooms.update(classroom)
            try:
                await uow.commit()
            except Exception:
                # The row didn't change, so the new file would be left with nobody pointing at it.
                await self._delete_quietly(key)
                raise

        # The old logo isn't used anymore. If deleting it fails, it's only
        # wasted space, the upload itself already worked.
        if old_key:
            await self._delete_quietly(old_key)
        return classroom

    # Back to the initials on its color.
    async def remove_logo(self, classroom_id: UUID, teacher_id: UUID) -> Classroom:
        async with self._uow_factory() as uow:
            classroom = await self._get_own_classroom(uow, classroom_id, teacher_id)
            old_key = classroom.logo_key
            classroom.logo_key = None
            await uow.classrooms.update(classroom)
            await uow.commit()
        if old_key:
            await self._delete_quietly(old_key)
        return classroom

    # HU-76: the kid leaves the classroom and their guardian is told. The
    # enrollment goes away, so the guardian can ask to join again later.
    async def remove_student(self, classroom_id: UUID, enrollment_id: UUID, teacher_id: UUID) -> None:
        async with self._uow_factory() as uow:
            classroom = await self._get_own_classroom(uow, classroom_id, teacher_id)
            enrollment = await uow.enrollments.get_by_id(enrollment_id)
            if enrollment is None or enrollment.classroom_id != classroom_id or enrollment.status != STATUS_ACCEPTED:
                raise EnrollmentNotFound("Ese estudiante no está inscrito en esta clase.")
            await uow.enrollments.delete(enrollment_id)
            await uow.commit()

        event: dict[str, object] = {
            "event": "enrollment.removed",
            "classroom_id": str(classroom_id),
            "classroom_name": classroom.name,
            "enrollment_id": str(enrollment_id),
            "teacher_id": str(classroom.teacher_id),
        }
        event |= await self._guardian_fields(enrollment.student_id)
        try:
            event["teacher_name"] = await self._identity.obtener_nombre_docente(classroom.teacher_id)
        except (IdentityServiceUnavailable, ResourceNotFound):
            logger.warning("No fue posible resolver el nombre del docente para el evento de retiro.")
        await self._publish_event_safely(REQUESTS_CHANNEL, event)

    # HU-85: the classroom with its lessons, enrollments and logo. The
    # lessons go first: if content-service can't delete them, nothing is
    # deleted and the teacher can try again, so no lesson is ever left
    # behind without its classroom.
    async def delete_classroom(self, classroom_id: UUID, teacher_id: UUID) -> None:
        async with self._uow_factory() as uow:
            classroom = await self._get_own_classroom(uow, classroom_id, teacher_id)

        await self._content.delete_classroom_lessons(classroom_id)

        async with self._uow_factory() as uow:
            await uow.classrooms.delete(classroom_id)
            await uow.commit()
        if classroom.logo_key:
            await self._delete_quietly(classroom.logo_key)
        logger.info("Aula %s eliminada por su docente.", classroom_id)

    async def get_logo(self, classroom_id: UUID, file_name: str, subject_id: UUID, role: str) -> SignedDownload:
        # Same rule as the classroom: its teacher and its accepted students.
        # A guardian with the portal open too (the route checks it): the id
        # and the file name are random, they only reach a family through the
        # code or an enrollment (ADR 0016). Any "no" is the same 404.
        async with self._uow_factory() as uow:
            classroom = await uow.classrooms.get_by_id(classroom_id)
            if classroom is None or classroom.logo_key is None or classroom.logo_file != file_name:
                raise ResourceNotFound("La imagen solicitada no existe.")
            allowed = False
            if role == "teacher":
                allowed = classroom.teacher_id == subject_id
            elif role == "student":
                enrollment = await uow.enrollments.get_by_student_and_classroom(subject_id, classroom_id)
                allowed = enrollment is not None and enrollment.status == STATUS_ACCEPTED
            elif role == "guardian":
                allowed = True
            if not allowed:
                raise ResourceNotFound("La imagen solicitada no existe.")
            key = classroom.logo_key
        return self._storage.sign_download(key)

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

        event: dict[str, object] = {
            "event": "request.resolved",
            "classroom_id": str(classroom_id),
            "classroom_name": classroom.name,
            "enrollment_id": str(enrollment_id),
            "decision": new_status,
            "teacher_id": str(classroom.teacher_id),
        }
        event |= await self._guardian_fields(enrollment.student_id)
        try:
            event["teacher_name"] = await self._identity.obtener_nombre_docente(classroom.teacher_id)
        except (IdentityServiceUnavailable, ResourceNotFound):
            logger.warning("No fue posible resolver el nombre del docente para el evento de solicitud.")
        await self._publish_event_safely(REQUESTS_CHANNEL, event)
        return enrollment

    # ------------------------------------------------------------------
    # Guardian (parents' portal, EP-07). Only the guardian types the code,
    # the kid never does (ADR 0016).
    # ------------------------------------------------------------------

    async def _family_kids(self, guardian_id: UUID) -> dict[UUID, str]:
        return {k.student_id: k.first_name for k in await self._identity.list_guardian_students(guardian_id)}

    async def _check_rate(self, key: str, maximum: int, window_sec: int) -> None:
        if not await self._rate_limiter.permitir(key, maximum, window_sec):
            raise AttemptLimitExceeded()

    # The teacher's profile is an extra: without identity-service the class
    # still shows, only without who teaches it.
    async def _teacher_profile(self, teacher_id: UUID) -> TeacherPublicProfile | None:
        try:
            return await self._identity.get_teacher_profile(teacher_id)
        except (IdentityServiceUnavailable, ResourceNotFound):
            logger.warning("No fue posible obtener el perfil del docente %s.", teacher_id)
            return None

    # HU-40: the class behind a code, with its teacher (HU-97), before
    # asking to join. Counted per guardian, so codes can't be guessed.
    async def preview_classroom(self, guardian_id: UUID, enrollment_code: str) -> ClassroomPreview:
        await self._check_rate(f"lookup:{guardian_id}", self._limits.lookup_max, self._limits.enrollment_window_sec)
        async with self._uow_factory() as uow:
            classroom = await uow.classrooms.get_by_code(normalize_code(enrollment_code))
        if classroom is None:
            raise InvalidEnrollmentCode()
        if not classroom.has_teacher:
            raise ClassroomWithoutTeacher()
        teacher, content = await asyncio.gather(
            self._teacher_profile(classroom.teacher_id), self._published_content([classroom.id])
        )
        return ClassroomPreview(
            classroom=classroom,
            teacher=teacher,
            published_lessons=None if content is None else content.get(classroom.id, NOTHING).lessons,
            published_units=None if content is None else content.get(classroom.id, NOTHING).units,
        )

    # HU-40: the guardian asks for one of their own kids. A pending or
    # accepted request blocks a new one, a rejected one goes back to pending.
    async def request_enrollment(self, guardian_id: UUID, student_id: UUID, enrollment_code: str) -> Enrollment:
        await self._check_rate(
            f"enroll:{guardian_id}", self._limits.enrollment_max, self._limits.enrollment_window_sec
        )
        kids = await self._family_kids(guardian_id)
        if student_id not in kids:
            raise KidNotInFamily()

        async with self._uow_factory() as uow:
            classroom = await uow.classrooms.get_by_code(normalize_code(enrollment_code))
            if classroom is None:
                raise InvalidEnrollmentCode()
            if not classroom.has_teacher:
                raise ClassroomWithoutTeacher()

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

        event = self._family_event("request.created", classroom, enrollment, kids[student_id])
        event |= await self._guardian_fields(student_id)
        await self._publish_event_safely(REQUESTS_CHANNEL, event)
        return enrollment

    # One enrollment of the guardian's kids, with its classroom and the kid's
    # name. Someone else's answers the same as one that doesn't exist.
    async def _family_enrollment(self, guardian_id: UUID, enrollment_id: UUID) -> tuple[Enrollment, Classroom, str]:
        kids = await self._family_kids(guardian_id)
        async with self._uow_factory() as uow:
            enrollment = await uow.enrollments.get_by_id(enrollment_id)
            classroom = await uow.classrooms.get_by_id(enrollment.classroom_id) if enrollment else None
        if enrollment is None or classroom is None or enrollment.student_id not in kids:
            raise EnrollmentNotFound()
        return enrollment, classroom, kids[enrollment.student_id]

    # HU-42: the space of a class the kid is already in, with its teacher.
    async def get_family_classroom(self, guardian_id: UUID, enrollment_id: UUID) -> FamilyClassroomDetail:
        enrollment, classroom, first_name = await self._family_enrollment(guardian_id, enrollment_id)
        if enrollment.status != STATUS_ACCEPTED:
            raise NotInClassroomYet()
        teacher, content = await asyncio.gather(
            self._teacher_profile(classroom.teacher_id), self._published_content([classroom.id])
        )
        family = FamilyClassroom(
            student_id=enrollment.student_id,
            student_first_name=first_name,
            enrollment_id=enrollment.id,
            status=enrollment.status,
            requested_at=enrollment.requested_at,
            classroom=classroom,
            teacher_name=teacher.full_name if teacher else None,
            published_lessons=None if content is None else content.get(classroom.id, NOTHING).lessons,
            published_units=None if content is None else content.get(classroom.id, NOTHING).units,
            resolved_at=enrollment.resolved_at,
        )
        return FamilyClassroomDetail(family=family, teacher=teacher)

    # HU-49: a kid in the class leaves it, a request still waiting is
    # cancelled, and a rejected one is just taken off the list. The teacher
    # hears about the first two, with the guardian's and the kid's names.
    async def leave_classroom(self, guardian_id: UUID, enrollment_id: UUID) -> None:
        enrollment, classroom, first_name = await self._family_enrollment(guardian_id, enrollment_id)
        async with self._uow_factory() as uow:
            await uow.enrollments.delete(enrollment.id)
            await uow.commit()
        if enrollment.status == STATUS_REJECTED:
            return

        kind = "enrollment.withdrawn" if enrollment.status == STATUS_ACCEPTED else "request.cancelled"
        event = self._family_event(kind, classroom, enrollment, first_name)
        event |= await self._guardian_fields(enrollment.student_id)
        await self._publish_event_safely(REQUESTS_CHANNEL, event)

    # HU-48: a message to the teacher of a class the kid is in, kept in their
    # tray as a notification. Unlike the other events, losing it would lose
    # what the guardian wrote, so a failure is reported instead of skipped.
    async def send_message(
        self, guardian_id: UUID, enrollment_id: UUID, subject: str, body: str, thread_id: UUID | None = None
    ) -> None:
        await self._check_rate(f"message:{guardian_id}", self._limits.message_max, self._limits.message_window_sec)
        enrollment, classroom, first_name = await self._family_enrollment(guardian_id, enrollment_id)
        if enrollment.status != STATUS_ACCEPTED:
            raise NotInClassroomYet()
        if not classroom.has_teacher:
            raise ClassroomWithoutTeacher()

        event = self._family_event("message.sent", classroom, enrollment, first_name)
        event |= await self._guardian_fields(enrollment.student_id)
        event |= {"subject": subject, "body": body} | _thread(thread_id)
        try:
            await self._events.publicar(REQUESTS_CHANNEL, event)
        except Exception as exc:  # noqa: BLE001, any infra failure means it wasn't sent
            logger.warning("No fue posible enviar el mensaje del tutor al docente de %s.", classroom.id)
            raise MessageNotSent() from exc

    # HU-77: the teacher writes to a kid of the class or to their guardian.
    # It's kept in that person's tray, and a copy (already read) in the
    # teacher's. Like a family's message, a failure is reported: losing it
    # would lose what the teacher wrote.
    async def send_family_message(
        self,
        classroom_id: UUID,
        enrollment_id: UUID,
        teacher_id: UUID,
        recipient: str,
        subject: str,
        body: str,
        thread_id: UUID | None = None,
    ) -> None:
        await self._check_rate(
            f"teacher-message:{teacher_id}", self._limits.message_max, self._limits.message_window_sec
        )
        async with self._uow_factory() as uow:
            classroom = await self._get_own_classroom(uow, classroom_id, teacher_id)
            enrollment = await uow.enrollments.get_by_id(enrollment_id)
        if enrollment is None or enrollment.classroom_id != classroom_id or enrollment.status != STATUS_ACCEPTED:
            raise EnrollmentNotFound("Ese estudiante no está inscrito en esta clase.")

        family = await self._guardian_fields(enrollment.student_id)
        # Without knowing who the guardian is, their message has nowhere to go.
        if recipient == "guardian" and "guardian_id" not in family:
            raise MessageNotSent()
        event = self._family_event("teacher.message", classroom, enrollment, "")
        event |= family | {"recipient": recipient, "subject": subject, "body": body} | _thread(thread_id)
        if not event["student_name"]:
            event.pop("student_name")
        teacher_name = await self._teacher_name(classroom.teacher_id)
        if teacher_name:
            event["teacher_name"] = teacher_name
        try:
            await self._events.publicar(REQUESTS_CHANNEL, event)
        except Exception as exc:  # noqa: BLE001, any infra failure means it wasn't sent
            logger.warning("No fue posible enviar el mensaje del docente de %s.", classroom.id)
            raise MessageNotSent() from exc

    # HU-46 and HU-47: how far the kid got in each lesson of the class and
    # their tries, only once they're in it.
    async def get_family_progress(self, guardian_id: UUID, enrollment_id: UUID) -> list[dict[str, object]]:
        enrollment, classroom, _first_name = await self._family_enrollment(guardian_id, enrollment_id)
        if enrollment.status != STATUS_ACCEPTED:
            raise NotInClassroomYet()
        return await self._content.student_progress(classroom.id, enrollment.student_id)

    # HU-86, HU-87: the statistics of the teacher's class, with the name and
    # avatar of each kid next to their numbers. content-service counts,
    # classroom-service says who is in the class and who they are.
    async def get_statistics(self, classroom_id: UUID, teacher_id: UUID) -> dict[str, object]:
        async with self._uow_factory() as uow:
            await self._get_own_classroom(uow, classroom_id, teacher_id)
            accepted = await uow.enrollments.list_accepted_by_classroom(classroom_id)
        student_ids = [e.student_id for e in accepted]
        statistics, infos = await asyncio.gather(
            self._content.classroom_statistics(classroom_id, student_ids),
            asyncio.gather(*(self._identity.obtener_estudiante(s) for s in student_ids), return_exceptions=True),
        )
        # Without identity-service a kid still counts, only without a name.
        who: dict[str, dict[str, object]] = {}
        for student_id, info in zip(student_ids, infos):
            if isinstance(info, StudentInfo):
                who[str(student_id)] = {"first_name": info.first_name, "avatar_id": info.avatar_id}
            else:
                who[str(student_id)] = {"first_name": "Estudiante sin datos", "avatar_id": 1}

        def named(kids: object) -> list[dict[str, object]]:
            items = kids if isinstance(kids, list) else []
            return [kid | who.get(str(kid.get("student_id")), {}) for kid in items if isinstance(kid, dict)]

        lessons = statistics.get("lessons")
        return statistics | {
            "lessons": [
                lesson | {"kids": named(lesson.get("kids"))}
                for lesson in (lessons if isinstance(lessons, list) else [])
                if isinstance(lesson, dict)
            ],
            "by_kid": named(statistics.get("by_kid")),
        }

    # What every event about a family's enrollment carries.
    @staticmethod
    def _family_event(kind: str, classroom: Classroom, enrollment: Enrollment, first_name: str) -> dict[str, object]:
        return {
            "event": kind,
            "classroom_id": str(classroom.id),
            "classroom_name": classroom.name,
            "enrollment_id": str(enrollment.id),
            "teacher_id": str(classroom.teacher_id),
            "student_id": str(enrollment.student_id),
            "student_name": first_name,
        }

    # ------------------------------------------------------------------
    # Student
    # ------------------------------------------------------------------

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

    # HU-83, asked by content-service: a new lesson (or a new extra of a
    # published one) goes out as one event with every kid it's for and
    # their guardian. A kid whose guardian isn't known still gets theirs.
    async def announce(
        self,
        classroom_id: UUID,
        kind: str,
        lesson_id: UUID,
        lesson_title: str,
        extra_title: str | None,
        student_ids: list[UUID] | None,
    ) -> None:
        async with self._uow_factory() as uow:
            classroom = await uow.classrooms.get_by_id(classroom_id)
            if classroom is None:
                raise ClassroomNotFound()
            accepted = await uow.enrollments.list_accepted_by_classroom(classroom_id)
        if student_ids is not None:
            wanted = set(student_ids)
            accepted = [e for e in accepted if e.student_id in wanted]
        if not accepted:
            return

        families, teacher_name = await asyncio.gather(
            asyncio.gather(*(self._guardian_fields(e.student_id) for e in accepted)),
            self._teacher_name(classroom.teacher_id),
        )
        members = [
            {
                "enrollment_id": str(e.id),
                "student_id": str(e.student_id),
                **{k: v for k, v in family.items() if k in ("student_name", "guardian_id")},
            }
            for e, family in zip(accepted, families)
        ]
        event: dict[str, object] = {
            "event": kind,
            "classroom_id": str(classroom.id),
            "classroom_name": classroom.name,
            "teacher_id": str(classroom.teacher_id),
            "lesson_id": str(lesson_id),
            "lesson_title": lesson_title,
            "members": members,
        }
        if extra_title:
            event["extra_title"] = extra_title
        if teacher_name:
            event["teacher_name"] = teacher_name
        await self._publish_event_safely(REQUESTS_CHANNEL, event)

    # HU-69, asked by content-service: a kid of the class finished the
    # reading or the activity of a lesson, for their teacher. A kid who
    # isn't in the class anymore is a 404.
    async def report_student(
        self,
        classroom_id: UUID,
        student_id: UUID,
        kind: str,
        lesson_id: UUID,
        lesson_title: str,
        correct: int | None,
        total: int | None,
    ) -> None:
        async with self._uow_factory() as uow:
            classroom = await uow.classrooms.get_by_id(classroom_id)
            enrollment = await uow.enrollments.get_by_student_and_classroom(student_id, classroom_id)
        if classroom is None:
            raise ClassroomNotFound()
        if enrollment is None or enrollment.status != STATUS_ACCEPTED:
            raise EnrollmentNotFound("Ese estudiante no está inscrito en esta clase.")

        event = self._family_event(kind, classroom, enrollment, "")
        event |= {"lesson_id": str(lesson_id), "lesson_title": lesson_title}
        event |= {k: v for k, v in (await self._guardian_fields(student_id)).items() if k == "student_name"}
        if not event["student_name"]:
            event.pop("student_name")
        if correct is not None and total is not None:
            event |= {"correct": correct, "total": total}
        await self._publish_event_safely(REQUESTS_CHANNEL, event)

    # HU-91, asked by identity-service before deleting a guardian: every
    # enrollment of their kids goes, in any class and any state. Nothing is
    # told to anybody: the kid's name would stay in the teacher's tray.
    # Says how many went; asking again finds none.
    async def erase_students(self, student_ids: list[UUID]) -> int:
        async with self._uow_factory() as uow:
            deleted = await uow.enrollments.delete_by_students(student_ids)
            await uow.commit()
        return deleted

    # HU-92, asked by identity-service before deleting a teacher: their
    # classes stay for the kids already in them, but they're marked as
    # without a teacher, and every request still waiting is closed, telling
    # its family why. Asking again changes nothing.
    async def teacher_left(self, teacher_id: UUID) -> None:
        now = datetime.now(timezone.utc)
        closed: list[tuple[Classroom, Enrollment]] = []
        async with self._uow_factory() as uow:
            for classroom in await uow.classrooms.list_by_teacher(teacher_id):
                if classroom.has_teacher:
                    classroom.teacher_left_at = now
                    await uow.classrooms.update(classroom)
                for enrollment in await uow.enrollments.list_pending_by_classroom(classroom.id):
                    await uow.enrollments.delete(enrollment.id)
                    closed.append((classroom, enrollment))
            await uow.commit()

        for classroom, enrollment in closed:
            event = self._family_event("request.closed", classroom, enrollment, "")
            event |= await self._guardian_fields(enrollment.student_id)
            if not event["student_name"]:
                event.pop("student_name")
            await self._publish_event_safely(REQUESTS_CHANNEL, event)

    # The teacher's name for an event, or None without identity-service.
    async def _teacher_name(self, teacher_id: UUID) -> str | None:
        try:
            return await self._identity.obtener_nombre_docente(teacher_id)
        except (IdentityServiceUnavailable, ResourceNotFound):
            logger.warning("No fue posible resolver el nombre del docente para un evento.")
            return None

    async def _delete_quietly(self, key: str) -> None:
        try:
            await self._storage.delete(key)
        except Exception:  # noqa: BLE001, cleaning up storage is never worth failing the request
            logger.warning("No fue posible borrar el archivo %s del almacenamiento.", key)

    # The kid and their guardian, so notification-service can also tell the
    # guardian. Without identity-service the event still goes out with what
    # is known, the teacher gets theirs and only the guardian's is missing.
    async def _guardian_fields(self, student_id: UUID) -> dict[str, object]:
        try:
            info = await self._identity.obtener_estudiante(student_id)
        except (IdentityServiceUnavailable, ResourceNotFound):
            logger.warning("No fue posible resolver el estudiante y su tutor para el evento de solicitud.")
            return {}
        return {
            "student_id": str(student_id),
            "student_name": info.first_name,
            "guardian_id": str(info.guardian_person_id),
            "guardian_name": info.guardian_name,
        }

    # ------------------------------------------------------------------
    # Publishing to Redis is a non-critical side effect. If Redis doesn't
    # respond, the business operation that already got committed to the
    # database shouldn't fail because of it.
    async def _publish_event_safely(self, canal: str, evento: dict[str, object]) -> None:
        try:
            await self._events.publicar(canal, evento)
        except Exception:  # noqa: BLE001, any infra failure here is non-critical
            logger.warning("No fue posible publicar el evento %s en el canal %s.", evento.get("event"), canal)
