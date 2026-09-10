"""Test doubles for the ports that talk to the outside world (identity-service,
S3/MinIO), injected via app.dependency_overrides to avoid hitting the real
network in tests."""

from __future__ import annotations

from uuid import UUID, uuid4

from app.domain.entities import StudentInfo, UserClaims
from app.domain.exceptions import IdentityServiceUnavailable, ResourceNotFound, InvalidToken


class FakeIdentityGateway:
    def __init__(self) -> None:
        self._tokens: dict[str, UserClaims] = {}
        self._students: dict[UUID, StudentInfo] = {}
        self.fallar_con_no_disponible = False

    def registrar_docente(self, teacher_id: UUID | None = None) -> tuple[str, UUID]:
        teacher_id = teacher_id or uuid4()
        token = f"token-docente-{uuid4().hex}"
        self._tokens[token] = UserClaims(sub=teacher_id, role="teacher", extra={})
        return token, teacher_id

    def registrar_estudiante_token(
        self, student_id: UUID | None = None, nombres: str = "Sofía", avatar: str = "zorro"
    ) -> tuple[str, UUID]:
        student_id = student_id or uuid4()
        token = f"token-estudiante-{uuid4().hex}"
        self._tokens[token] = UserClaims(sub=student_id, role="student", extra={"guardian_id": str(uuid4())})
        self._students[student_id] = StudentInfo(
            student_id=student_id,
            first_name=nombres,
            avatar=avatar,
            guardian_first_name="Ana",
            guardian_last_name="Pérez",
            guardian_email="ana@example.com",
            guardian_phone="3001234567",
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


class FakeObjectStorage:
    def __init__(self) -> None:
        self.archivos: dict[str, bytes] = {}

    async def subir(self, key: str, contenido: bytes, content_type: str) -> str:
        self.archivos[key] = contenido
        return f"http://fake-storage.local/iris-media/{key}"
