# Test doubles for the ports that talk to the outside world (identity-service,
# Garage), injected via app.dependency_overrides to avoid hitting the real
# network in tests.

from __future__ import annotations

from uuid import UUID, uuid4

from app.domain.entities import (
    GuardianStudent,
    PublishedContent,
    SignedDownload,
    StudentInfo,
    TeacherExperience,
    TeacherPublicProfile,
    TeacherStudy,
    UserClaims,
)
from app.domain.exceptions import (
    ContentServiceUnavailable,
    ProgressUnavailable,
    StatisticsUnavailable,
    IdentityServiceUnavailable,
    InvalidToken,
    PortalAccessRequired,
    ResourceNotFound,
    StorageFull,
)


class FakeIdentityGateway:
    # The one the running test uses (each test makes a new one), so helpers
    # can find it without passing it around.
    current: "FakeIdentityGateway | None" = None

    def __init__(self) -> None:
        FakeIdentityGateway.current = self
        self._tokens: dict[str, UserClaims] = {}
        self._students: dict[UUID, StudentInfo] = {}
        self._teacher_names: dict[UUID, str] = {}
        self.fallar_con_no_disponible = False
        # renew of each token validation, in order.
        self.renews: list[bool] = []
        # The guardian of every student registered here.
        self.guardian_person_id = uuid4()
        # The kids of each guardian registered with registrar_tutor_con_peques.
        self._guardian_students: dict[UUID, list[GuardianStudent]] = {}
        # Whether the guardians have the parents' portal open, and the
        # renew of each check, in order.
        self.portal_open = True
        self.portal_renews: list[bool] = []
        # The guardian token of each kid, made the first time it's asked.
        self._guardian_of_kid: dict[UUID, str] = {}

    # The teacher comes from a session that already passed the 2FA code,
    # unless verificado=False.
    def registrar_docente(
        self, teacher_id: UUID | None = None, nombre: str = "Carlos Ruiz", verificado: bool = True
    ) -> tuple[str, UUID]:
        teacher_id = teacher_id or uuid4()
        token = f"token-docente-{uuid4().hex}"
        self._tokens[token] = UserClaims(sub=teacher_id, role="teacher", extra={"mfa": "1"} if verificado else {})
        self._teacher_names[teacher_id] = nombre
        return token, teacher_id

    def registrar_estudiante_token(
        self, student_id: UUID | None = None, nombres: str = "Sofía", avatar_id: int = 1
    ) -> tuple[str, UUID]:
        student_id = student_id or uuid4()
        token = f"token-estudiante-{uuid4().hex}"
        self._tokens[token] = UserClaims(sub=student_id, role="student", extra={"guardian_id": str(uuid4())})
        self._students[student_id] = StudentInfo(
            student_id=student_id,
            first_name=nombres,
            avatar_id=avatar_id,
            guardian_first_name="Ana",
            guardian_last_name="Pérez",
            guardian_email="ana@example.com",
            guardian_phone="3001234567",
            guardian_person_id=self.guardian_person_id,
        )
        return token, student_id

    def registrar_tutor_token(self) -> str:
        token = f"token-tutor-{uuid4().hex}"
        self._tokens[token] = UserClaims(sub=uuid4(), role="guardian", extra={})
        return token

    # A guardian signed in from a session ("sid"), with these kids.
    def registrar_tutor_con_peques(self, *student_ids: UUID, sid: str | None = "sesion-tutor") -> tuple[str, UUID]:
        guardian_id = uuid4()
        token = f"token-tutor-{uuid4().hex}"
        self._tokens[token] = UserClaims(sub=guardian_id, role="guardian", extra={"sid": sid} if sid else {})
        self._guardian_students[guardian_id] = [
            GuardianStudent(
                student_id=s,
                first_name=self._students[s].first_name if s in self._students else "Peque",
                avatar_id=1,
            )
            for s in student_ids
        ]
        return token, guardian_id

    # A guardian (with the portal open) for the kid behind a student token,
    # always the same one, so tests ask to join the way a family does.
    def tutor_de(self, student_token: str) -> str:
        student_id = self.sub_de(student_token)
        if student_id not in self._guardian_of_kid:
            self._guardian_of_kid[student_id] = self.registrar_tutor_con_peques(student_id)[0]
        return self._guardian_of_kid[student_id]

    # Who a token belongs to, without counting as a validation.
    def sub_de(self, token: str) -> UUID:
        return self._tokens[token].sub

    async def get_teacher_profile(self, teacher_id: UUID) -> TeacherPublicProfile:
        if self.fallar_con_no_disponible:
            raise IdentityServiceUnavailable()
        name = self._teacher_names.get(teacher_id)
        if name is None:
            raise ResourceNotFound("Docente no encontrado.")
        first_name, _, last_name = name.partition(" ")
        return TeacherPublicProfile(
            first_name=first_name,
            last_name=last_name,
            about="Docente de primaria.",
            institution="Colegio Nacional",
            studies=(TeacherStudy("professional", "Licenciatura", "UPB", "2015-11", False),),
            experiences=(TeacherExperience("Docente", "Colegio San José", "2016-02", None, None),),
        )

    async def list_guardian_students(self, guardian_id: UUID) -> list[GuardianStudent]:
        if self.fallar_con_no_disponible:
            raise IdentityServiceUnavailable()
        return self._guardian_students.get(guardian_id, [])

    async def check_portal_access(self, person_id: UUID, session_id: str, renew: bool) -> None:
        self.portal_renews.append(renew)
        if not self.portal_open:
            raise PortalAccessRequired()

    async def validar_token(self, access_token: str, renew: bool = True) -> UserClaims:
        self.renews.append(renew)
        if self.fallar_con_no_disponible:
            raise IdentityServiceUnavailable()
        claims = self._tokens.get(access_token)
        if claims is None:
            raise InvalidToken()
        return claims

    async def obtener_estudiante(self, student_id: UUID) -> StudentInfo:
        if self.fallar_con_no_disponible:
            raise IdentityServiceUnavailable()
        info = self._students.get(student_id)
        if info is None:
            raise ResourceNotFound("Estudiante no encontrado.")
        return info

    async def obtener_nombre_docente(self, teacher_id: UUID) -> str:
        if self.fallar_con_no_disponible:
            raise IdentityServiceUnavailable()
        name = self._teacher_names.get(teacher_id)
        if name is None:
            raise ResourceNotFound("Docente no encontrado.")
        return name


class FakeObjectStorage:
    def __init__(self) -> None:
        self.archivos: dict[str, bytes] = {}
        self.lleno = False

    async def upload(self, key: str, content: bytes, content_type: str) -> None:
        if self.lleno:
            raise StorageFull()
        self.archivos[key] = content

    def sign_download(self, key: str) -> SignedDownload:
        return SignedDownload(
            path=f"/test-bucket/{key}", authorization="AWS4-HMAC-SHA256 test", amz_date="20260101T000000Z",
            content_sha256="UNSIGNED-PAYLOAD",
        )

    async def delete(self, key: str) -> None:
        self.archivos.pop(key, None)


class FakeContentGateway:
    def __init__(self) -> None:
        # Classrooms whose lessons were deleted, in order.
        self.deleted: list[UUID] = []
        self.unavailable = False
        # Published lessons of each classroom and the units they're in, for
        # the parents' portal.
        self.published: dict[UUID, int] = {}
        self.published_units: dict[UUID, int] = {}
        # The progress of each kid in each classroom, as content-service sends it.
        self.progress: dict[tuple[UUID, UUID], list[dict[str, object]]] = {}
        # The kids each request for statistics was made with.
        self.statistics_asked: list[tuple[UUID, list[UUID]]] = []

    async def delete_classroom_lessons(self, classroom_id: UUID) -> None:
        if self.unavailable:
            raise ContentServiceUnavailable()
        self.deleted.append(classroom_id)

    async def published_content(self, classroom_ids: list[UUID]) -> dict[UUID, PublishedContent]:
        if self.unavailable:
            raise ContentServiceUnavailable()
        return {
            c: PublishedContent(lessons=self.published.get(c, 0), units=self.published_units.get(c, 0))
            for c in classroom_ids
        }

    async def classroom_statistics(self, classroom_id: UUID, student_ids: list[UUID]) -> dict[str, object]:
        if self.unavailable:
            raise StatisticsUnavailable()
        self.statistics_asked.append((classroom_id, list(student_ids)))
        kid = {"percent": 100, "tries": 1, "best_correct": 2, "best_total": 2, "passed": True}
        lesson = {
            "lesson_id": str(uuid4()),
            "title": "Animales",
            "unit_title": "Unidad 1",
            "has_activity": True,
            "average_percent": 100,
            "completed": len(student_ids),
            "in_progress": 0,
            "not_started": 0,
            "passed": len(student_ids),
            "tried_not_passed": 0,
            "kids": [{"student_id": str(s), **kid} for s in student_ids],
        }
        return {
            "kids": len(student_ids),
            "lessons": [lesson],
            "completed_percent": 100,
            "average_percent": 100,
            "by_kid": [{"student_id": str(s), "average_percent": 100, "completed_lessons": 1} for s in student_ids],
        }

    async def student_progress(self, classroom_id: UUID, student_id: UUID) -> list[dict[str, object]]:
        if self.unavailable:
            raise ProgressUnavailable()
        return self.progress.get((classroom_id, student_id), [])
