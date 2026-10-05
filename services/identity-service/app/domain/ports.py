# Protocols the application layer uses to talk to the outside world,
# implemented in infrastructure/. This is what keeps application/ free of
# direct SQLAlchemy, jwt or bcrypt imports.

from __future__ import annotations

from datetime import date, datetime
from types import TracebackType
from typing import Protocol
from uuid import UUID

from app.domain.entities import (
    Avatar,
    Consent,
    DocumentType,
    Guardian,
    Person,
    ProfileChange,
    RelationshipType,
    SessionRecord,
    SignedDownload,
    Student,
    SupportCondition,
    Teacher,
    TeacherConsent,
    TeacherProfile,
)


class PersonRepository(Protocol):
    async def get_by_email(self, email: str) -> Person | None: ...
    async def get_by_id(self, person_id: UUID) -> Person | None: ...
    async def get_by_document_number(self, document_number: str) -> Person | None: ...
    async def add(self, person: Person) -> None: ...
    async def update_profile(
        self,
        person_id: UUID,
        *,
        first_name: str,
        last_name: str,
        date_of_birth: date,
        phone_country_code: str,
        phone_number: str,
    ) -> None:
        # Updates only the fields a person is allowed to change about
        # themselves. Document type, document number, email and the document
        # issue date are read-only, since they identify the account or the
        # document itself, so this method has no way to change them.
        ...
    async def update_password(self, person_id: UUID, hash_password: str) -> None: ...
    async def update_totp(self, person_id: UUID, totp_secret: str | None, totp_enabled: bool) -> None: ...


class GuardianRepository(Protocol):
    async def get_by_person_id(self, person_id: UUID) -> Guardian | None: ...
    async def get_by_id(self, guardian_id: UUID) -> Guardian | None: ...
    async def add(self, guardian: Guardian) -> None: ...
    async def delete(self, guardian_id: UUID) -> None: ...
    async def update_relationship_type(self, guardian_id: UUID, relationship_type_id: int) -> None: ...


class TeacherRepository(Protocol):
    async def get_by_person_id(self, person_id: UUID) -> Teacher | None: ...
    async def get_by_id(self, teacher_id: UUID) -> Teacher | None: ...
    async def add(self, teacher: Teacher) -> None: ...
    async def update_institution(self, teacher_id: UUID, institution: str | None) -> None: ...


# A teacher's profile is saved as a whole: the form always sends all of it,
# so replacing it is simpler and safer than patching each list.
class TeacherProfileRepository(Protocol):
    async def get(self, teacher_id: UUID) -> TeacherProfile: ...
    async def replace(self, teacher_id: UUID, profile: TeacherProfile) -> None: ...


class StudentRepository(Protocol):
    async def get_by_id(self, student_id: UUID) -> Student | None: ...
    async def list_by_guardian(self, guardian_id: UUID) -> list[Student]: ...
    async def add(self, student: Student) -> None: ...
    async def update_avatar(self, student_id: UUID, avatar_id: int) -> None: ...

    # What a guardian can change about a kid from "sus datos". The PIN has
    # its own method, so this one can't touch it.
    async def update_details(
        self,
        student_id: UUID,
        *,
        first_name: str,
        last_name: str,
        date_of_birth: date,
        avatar_id: int,
        support_condition_ids: list[int],
        support_condition_other: str | None,
        additional_support_need: str | None,
    ) -> None: ...

    async def update_pin(self, student_id: UUID, hash_pin: str) -> None: ...


class ConsentRepository(Protocol):
    async def add(self, consent: Consent) -> None: ...


class TeacherConsentRepository(Protocol):
    async def add(self, consent: TeacherConsent) -> None: ...


# Only adds. A saved change is a record of what happened, so there is no
# way to edit or delete one from here (they go away only with the person).
class ProfileChangeRepository(Protocol):
    async def add(self, change: ProfileChange) -> None: ...


class SessionHistoryRepository(Protocol):
    async def add(self, record: SessionRecord) -> None: ...
    # Marks the session as still in use (each time its token is renewed).
    async def touch(self, session_id: str, at: datetime) -> None: ...
    # Closes one session, if it's still open.
    async def end(self, session_id: str, at: datetime, reason: str) -> None: ...
    # Closes every open session of a person.
    async def end_all(self, person_id: UUID, at: datetime, reason: str) -> None: ...


class DocumentTypeRepository(Protocol):
    async def list_all(self) -> list[DocumentType]: ...
    async def get_by_id(self, document_type_id: int) -> DocumentType | None: ...


class RelationshipTypeRepository(Protocol):
    async def list_all(self) -> list[RelationshipType]: ...
    async def get_by_id(self, relationship_type_id: int) -> RelationshipType | None: ...


class SupportConditionRepository(Protocol):
    async def list_all(self) -> list[SupportCondition]: ...
    async def get_by_id(self, support_condition_id: int) -> SupportCondition | None: ...


# Garage, read only. identity-service never uploads, new avatars are added
# by an administrator.
class ObjectStorage(Protocol):
    # Signs a GET of the key for Caddy (see app/api/media.py). No network
    # call: if the file is missing, Garage answers 404 when Caddy asks.
    def sign_download(self, key: str) -> SignedDownload: ...


class AvatarRepository(Protocol):
    async def list_all(self) -> list[Avatar]: ...
    async def get_by_id(self, avatar_id: int) -> Avatar | None: ...


class UnitOfWork(Protocol):
    @property
    def people(self) -> PersonRepository: ...

    @property
    def guardians(self) -> GuardianRepository: ...

    @property
    def teachers(self) -> TeacherRepository: ...

    @property
    def teacher_profiles(self) -> TeacherProfileRepository: ...

    @property
    def students(self) -> StudentRepository: ...

    @property
    def consents(self) -> ConsentRepository: ...

    @property
    def teacher_consents(self) -> TeacherConsentRepository: ...

    @property
    def profile_changes(self) -> ProfileChangeRepository: ...

    @property
    def session_history(self) -> SessionHistoryRepository: ...

    @property
    def document_types(self) -> DocumentTypeRepository: ...

    @property
    def relationship_types(self) -> RelationshipTypeRepository: ...

    @property
    def support_conditions(self) -> SupportConditionRepository: ...

    @property
    def avatars(self) -> AvatarRepository: ...

    async def __aenter__(self) -> "UnitOfWork": ...
    async def __aexit__(
        self, exc_type: type[BaseException] | None, exc: BaseException | None, tb: TracebackType | None
    ) -> None: ...
    async def commit(self) -> None: ...
    async def rollback(self) -> None: ...
    async def flush(self) -> None:
        # Sends pending INSERT/UPDATE statements to the DB without closing the
        # transaction. Needed between FK-related entities built with a plain id
        # instead of an ORM object graph. Without it, automatic flush order
        # between them isn't guaranteed.
        ...


class PasswordHasher(Protocol):
    def hash(self, valor_plano: str) -> str: ...
    def verificar(self, valor_plano: str, hash_guardado: str) -> bool: ...

    @property
    def dummy_hash(self) -> str:
        # A precomputed hash that never matches a real password or PIN, used to
        # keep a failed login's timing constant when there's no real hash to check
        # against (see AuthService.login).
        ...


class TokenIssuer(Protocol):
    def emitir_access_token(self, subject_id: UUID, role: str, extra: dict[str, str], sid: str) -> str: ...
    def emitir_refresh_token(self, subject_id: UUID, role: str, sid: str) -> tuple[str, str]:
        # Returns (token, jti). The jti lets logout invalidate it later.
        # subject_id is person_id for guardian/teacher, and student_id for a
        # student profile, since Student isn't a Person in this model.
        ...

    def decodificar(self, token: str) -> dict[str, object]: ...


class PortalAccessStore(Protocol):
    # Short lived proof that a guardian (parents' portal) or a teacher (their
    # panel) passed the 2FA check. It belongs to the session where the code
    # was typed, so the code never opens another browser with that account.
    async def conceder(self, person_id: UUID, session_id: str, ttl_seg: int) -> None: ...

    # True while the access is still open, and in that case it starts the
    # inactivity count again. Past max_age_seg since the code it is closed.
    async def renovar(self, person_id: UUID, session_id: str, ttl_seg: int, max_age_seg: int) -> bool: ...

    # Same answer as renovar, but without starting the count again.
    async def esta_abierto(self, person_id: UUID, session_id: str, max_age_seg: int) -> bool: ...

    async def revocar(self, person_id: UUID, session_id: str) -> None: ...

    async def revocar_todas(self, person_id: UUID) -> None: ...


# Proof that a teacher typed their 2FA code in a session at some point. It
# lasts as long as the session and keeps the mfa claim in renewed tokens;
# whether it's still recent is the PortalAccessStore's job.
class SessionMfaStore(Protocol):
    async def mark_verified(self, person_id: UUID, session_id: str, ttl_sec: int) -> None: ...
    async def is_verified(self, person_id: UUID, session_id: str) -> bool: ...
    async def forget(self, session_id: str) -> None: ...


class AttemptLockout(Protocol):
    # Locks a key after too many failed attempts, and the wait grows each
    # time it happens again. Only failures count, a success starts over.
    async def segundos_bloqueado(self, clave: str) -> int:
        # Seconds left of the current lock, 0 when the key is free.
        ...

    async def registrar_fallo(self, clave: str) -> int:
        # Counts one failure. Returns the wait in seconds if this failure
        # locked the key, 0 if not.
        ...

    async def registrar_exito(self, clave: str) -> None: ...

    async def nivel(self, clave: str) -> int:
        # How many times the key got locked recently (0 if never).
        ...


class RateLimiter(Protocol):
    async def permitir(self, clave: str, maximo: int, ventana_seg: int) -> bool:
        # Increments the counter for clave and returns False once it passes
        # maximo within the window.
        ...

    async def segundos_restantes(self, clave: str) -> int:
        # Seconds until the window of clave ends, when the counter starts over.
        ...

    async def intentos(self, clave: str) -> int: ...

    async def olvidar(self, clave: str) -> None: ...


class TokenBlacklist(Protocol):
    async def invalidar(self, jti: str, ttl_seg: int) -> None: ...

    async def segundos_desde_invalidacion(self, jti: str) -> float | None:
        # None if the token was never invalidated. Used to tell a real
        # reuse (a stolen copy) from two requests racing each other.
        ...


# Sessions are told apart by a sid inside every token, and it stays the same
# when the tokens are refreshed. Revoking a sid kills that session at once,
# access token included. Closing all sessions of a person is a "tokens
# issued before this moment are void" mark.
class SessionRegistry(Protocol):
    async def revocar_sesion(self, sid: str, ttl_seg: int) -> None: ...

    async def sesion_revocada(self, sid: str) -> bool: ...

    async def cerrar_todas(self, person_id: UUID, ttl_seg: int) -> None: ...

    async def emitida_antes_del_cierre(self, person_id: UUID, emitido_en: int) -> bool: ...


# Wraps the TOTP (RFC 6238) algorithm itself, so the application layer
# never imports pyotp or qrcode directly — same reason PasswordHasher wraps
# bcrypt and TokenIssuer wraps PyJWT.
class TotpProvider(Protocol):
    def generar_secreto(self) -> str: ...
    def uri_aprovisionamiento(self, secreto: str, nombre_cuenta: str, emisor: str) -> str: ...
    def verificar(self, secreto: str, codigo: str, ventana: int) -> bool: ...
    def codigo_qr_base64(self, uri_aprovisionamiento: str) -> str:
        # Renders the provisioning URI as a QR code PNG, returned as a
        # data: URI ready to drop into an <img src>.
        ...


# The TOTP secret has to be readable back in plain text to verify a
# live code against it, so it's encrypted at rest, not hashed like a
# password or PIN.
class TotpEncryptor(Protocol):
    def encrypt(self, valor_plano: str) -> str: ...
    def decrypt(self, valor_cifrado: str) -> str: ...
