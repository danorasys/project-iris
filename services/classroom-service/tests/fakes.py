# Test doubles for the ports that talk to the outside world (identity-service,
# Garage), injected via app.dependency_overrides to avoid hitting the real
# network in tests.

from __future__ import annotations

from uuid import UUID, uuid4

from app.domain.entities import SignedDownload, StudentInfo, UserClaims
from app.domain.exceptions import IdentityServiceUnavailable, InvalidToken, ResourceNotFound, StorageFull


class FakeIdentityGateway:
    def __init__(self) -> None:
        self._tokens: dict[str, UserClaims] = {}
        self._students: dict[UUID, StudentInfo] = {}
        self._teacher_names: dict[UUID, str] = {}
        self.fallar_con_no_disponible = False
        # The guardian of every student registered here.
        self.guardian_person_id = uuid4()

    def registrar_docente(self, teacher_id: UUID | None = None, nombre: str = "Carlos Ruiz") -> tuple[str, UUID]:
        teacher_id = teacher_id or uuid4()
        token = f"token-docente-{uuid4().hex}"
        self._tokens[token] = UserClaims(sub=teacher_id, role="teacher", extra={})
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

    async def validar_token(self, access_token: str) -> UserClaims:
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
