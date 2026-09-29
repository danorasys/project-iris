# Auth use cases.
#
# Pure orchestration. No SQLAlchemy, jwt or bcrypt imports here, only the
# ports defined in app.domain.ports.

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from typing import Callable
from uuid import UUID

from app.application.dtos import (
    ConsentData,
    FirstStudentData,
    GuardianData,
    IssuedTokens,
    TeacherData,
)
from app.domain.document_number import document_number_format_error
from app.domain.entities import SUPPORT_CONDITION_NAME_OTHER, Consent, Guardian, Person, Student, Teacher
from app.domain.exceptions import (
    AttemptLimitExceeded,
    DocumentNumberAlreadyRegistered,
    EmailAlreadyRegistered,
    InvalidAvatar,
    InvalidCredentials,
    InvalidDocumentNumberFormat,
    InvalidDocumentType,
    InvalidPin,
    InvalidRelationshipType,
    InvalidSupportCondition,
    InvalidToken,
    ResourceNotFound,
)
from app.application.session_service import SessionService
from app.domain.ports import (
    AttemptLockout,
    PasswordHasher,
    PortalAccessStore,
    TokenBlacklist,
    TokenIssuer,
    UnitOfWork,
)
from app.security_log import log_security_event

UowFactory = Callable[[], "UnitOfWork"]


# Emails and IPs go into lock keys as a hash, so Redis never holds them as text.
def _anon(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]


class AuthService:
    def __init__(
        self,
        uow_factory: UowFactory,
        password_hasher: PasswordHasher,
        token_issuer: TokenIssuer,
        blacklist: TokenBlacklist,
        portal_access: PortalAccessStore,
        sessions: SessionService,
        login_lockout: AttemptLockout,
        account_lockout: AttemptLockout,
        pin_lockout: AttemptLockout,
        refresh_ttl_seconds: int,
        refresh_reuse_grace_sec: int,
    ) -> None:
        self._uow_factory = uow_factory
        self._hasher = password_hasher
        self._tokens = token_issuer
        self._blacklist = blacklist
        self._portal_access = portal_access
        self._sessions = sessions
        self._login_lockout = login_lockout
        self._account_lockout = account_lockout
        self._pin_lockout = pin_lockout
        self._refresh_ttl_seconds = refresh_ttl_seconds
        self._refresh_reuse_grace_sec = refresh_reuse_grace_sec

    async def register_guardian(
        self,
        guardian_data: GuardianData,
        student_data: FirstStudentData,
        consent_data: ConsentData,
    ) -> tuple[Person, Guardian, Student, IssuedTokens]:
        # Creates person, guardian, student and consent in a single
        # transaction. A student never registers itself, a guardian always does it.
        async with self._uow_factory() as uow:
            if await uow.people.get_by_email(guardian_data.email) is not None:
                raise EmailAlreadyRegistered()
            if await uow.people.get_by_document_number(guardian_data.document_number) is not None:
                raise DocumentNumberAlreadyRegistered()
            document_type = await uow.document_types.get_by_id(guardian_data.document_type_id)
            if document_type is None:
                raise InvalidDocumentType()
            format_error = document_number_format_error(document_type.name, guardian_data.document_number)
            if format_error:
                raise InvalidDocumentNumberFormat(format_error)
            if await uow.relationship_types.get_by_id(guardian_data.relationship_type_id) is None:
                raise InvalidRelationshipType()
            if await uow.avatars.get_by_id(student_data.avatar_id) is None:
                raise InvalidAvatar()
            support_condition = await uow.support_conditions.get_by_id(student_data.support_condition_id)
            if support_condition is None:
                raise InvalidSupportCondition()
            is_other_condition = support_condition.name == SUPPORT_CONDITION_NAME_OTHER
            if is_other_condition and not (student_data.support_condition_other or "").strip():
                raise InvalidSupportCondition("Debes especificar la condición.")
            if not is_other_condition and student_data.support_condition_other:
                raise InvalidSupportCondition(
                    "Solo puedes especificar una condición cuando eliges 'Otra condición (especificar)'."
                )

            now = datetime.now(timezone.utc)
            person = Person(
                id=uuid.uuid4(),
                first_name=guardian_data.first_name,
                last_name=guardian_data.last_name,
                email=guardian_data.email,
                hash_password=self._hasher.hash(guardian_data.password),
                created_at=now,
                document_type_id=guardian_data.document_type_id,
                document_number=guardian_data.document_number,
                document_issued_at=guardian_data.document_issued_at,
                phone_country_code=guardian_data.phone_country_code,
                phone_number=guardian_data.phone_number,
                date_of_birth=guardian_data.date_of_birth,
            )
            guardian = Guardian(
                id=uuid.uuid4(),
                person_id=person.id,
                relationship_type_id=guardian_data.relationship_type_id,
            )
            student = Student(
                id=uuid.uuid4(),
                guardian_id=guardian.id,
                first_name=student_data.first_name,
                last_name=student_data.last_name,
                date_of_birth=student_data.date_of_birth,
                hash_pin=self._hasher.hash(student_data.pin),
                avatar_id=student_data.avatar_id,
                support_condition_id=student_data.support_condition_id,
                support_condition_other=student_data.support_condition_other,
                additional_support_need=student_data.additional_support_need,
            )
            consent_entity = Consent(
                id=uuid.uuid4(),
                guardian_id=guardian.id,
                student_id=student.id,
                policy_version=consent_data.policy_version,
                granted_at=now,
                accepts_data_processing=consent_data.accepts_data_processing,
                authorizes_support_condition=consent_data.authorizes_support_condition,
            )

            # Flush after each insert. These models carry the FK as a plain UUID
            # instead of an ORM object reference, so SQLAlchemy can't infer insert
            # order on its own. Without the flush, the order isn't guaranteed and
            # can violate the FK on real Postgres. SQLite in tests won't catch it,
            # it doesn't enforce FKs.
            await uow.people.add(person)
            await uow.flush()
            await uow.guardians.add(guardian)
            await uow.flush()
            await uow.students.add(student)
            await uow.flush()
            await uow.consents.add(consent_entity)
            await uow.commit()

        tokens = self._issue_token_pair(person.id, "guardian")
        return person, guardian, student, tokens

    async def register_teacher(self, data: TeacherData) -> tuple[Person, Teacher, IssuedTokens]:
        async with self._uow_factory() as uow:
            if await uow.people.get_by_email(data.email) is not None:
                raise EmailAlreadyRegistered()
            if await uow.people.get_by_document_number(data.document_number) is not None:
                raise DocumentNumberAlreadyRegistered()
            document_type = await uow.document_types.get_by_id(data.document_type_id)
            if document_type is None:
                raise InvalidDocumentType()
            format_error = document_number_format_error(document_type.name, data.document_number)
            if format_error:
                raise InvalidDocumentNumberFormat(format_error)

            person = Person(
                id=uuid.uuid4(),
                first_name=data.first_name,
                last_name=data.last_name,
                email=data.email,
                hash_password=self._hasher.hash(data.password),
                created_at=datetime.now(timezone.utc),
                document_type_id=data.document_type_id,
                document_number=data.document_number,
                # Teacher registration doesn't have the country-flag selector
                # guardians do (see TeacherRegistrationRequest.phone): it only
                # ever collected a 10-digit local number, which was always
                # implicitly Colombian. Splitting the column doesn't change
                # that behavior, it just makes the assumption explicit here
                # instead of leaving it undocumented in a bare digit string.
                phone_country_code="57",
                phone_number=data.phone,
                date_of_birth=data.date_of_birth,
            )
            teacher = Teacher(id=uuid.uuid4(), person_id=person.id, institution=data.institution)

            await uow.people.add(person)
            await uow.teachers.add(teacher)
            await uow.commit()

        tokens = self._issue_token_pair(person.id, "teacher")
        return person, teacher, tokens

    async def login(self, email: str, password: str, client_ip: str) -> tuple[Person, str, IssuedTokens]:
        # Two locks: one per IP and email (so a stranger can't lock a victim
        # out from another IP) and one per email alone, with a higher limit, so
        # trying from many IPs doesn't give unlimited guesses.
        ip_key = f"login:{_anon(client_ip)}:{_anon(email.lower())}"
        account_key = f"login-account:{_anon(email.lower())}"
        wait = max(
            await self._login_lockout.segundos_bloqueado(ip_key),
            await self._account_lockout.segundos_bloqueado(account_key),
        )
        if wait:
            raise AttemptLimitExceeded(retry_after_seconds=wait)

        try:
            async with self._uow_factory() as uow:
                person = await uow.people.get_by_email(email)
                # Runs the same bcrypt check either way, even when there's no matching
                # email. Skipping it when person is None would make a missing email
                # respond faster than a wrong password, and that timing gap is enough
                # to tell an attacker which emails are registered.
                hash_to_check = person.hash_password if person is not None else self._hasher.dummy_hash
                password_matches = self._hasher.verificar(password, hash_to_check)
                if person is None or not password_matches:
                    raise InvalidCredentials()

                guardian = await uow.guardians.get_by_person_id(person.id)
                role = "guardian" if guardian is not None else "teacher"
        except InvalidCredentials:
            # Unknown emails are counted too, so the lock can't be used to
            # tell which emails exist.
            wait = max(
                await self._login_lockout.registrar_fallo(ip_key),
                await self._account_lockout.registrar_fallo(account_key),
            )
            if wait:
                log_security_event("login_locked", wait=wait, key=_anon(email.lower())[:8])
                raise AttemptLimitExceeded(retry_after_seconds=wait) from None
            raise

        # The per-email count is not reset here on purpose: it expires by itself,
        # otherwise a real login in between would give an attacker a fresh start.
        await self._login_lockout.registrar_exito(ip_key)
        # A new login is a new session, so the portal asks for the 2FA code again.
        await self._portal_access.revocar(person.id)
        tokens = self._issue_token_pair(person.id, role)
        return person, role, tokens

    async def login_student_profile(self, student_id: UUID, pin: str) -> tuple[Student, IssuedTokens]:
        limit_key = f"pin:{student_id}"
        wait = await self._pin_lockout.segundos_bloqueado(limit_key)
        if wait:
            raise AttemptLimitExceeded(retry_after_seconds=wait)

        try:
            async with self._uow_factory() as uow:
                student = await uow.students.get_by_id(student_id)
                if student is None:
                    raise ResourceNotFound("Perfil de estudiante no encontrado.")
                if not self._hasher.verificar(pin, student.hash_pin):
                    raise InvalidPin()
        except InvalidPin:
            wait = await self._pin_lockout.registrar_fallo(limit_key)
            if wait:
                log_security_event("pin_locked", wait=wait, student=student_id)
                raise AttemptLimitExceeded(retry_after_seconds=wait) from None
            raise

        await self._pin_lockout.registrar_exito(limit_key)
        tokens = self._issue_token_pair(student.id, "student", extra={"guardian_id": str(student.guardian_id)})
        return student, tokens

    async def refresh(self, refresh_token: str) -> IssuedTokens:
        claims = self._tokens.decodificar(refresh_token)
        if claims.get("type") != "refresh":
            raise InvalidToken()
        jti = claims.get("jti")
        if not isinstance(jti, str):
            raise InvalidToken()
        raw_sid = claims.get("sid")
        sid = raw_sid if isinstance(raw_sid, str) else None

        used_ago = await self._blacklist.segundos_desde_invalidacion(jti)
        if used_ago is not None:
            # A refresh token is single use. Seen again long after it was used
            # means someone kept a copy, so the whole session is closed. Just
            # after it was used it is two requests racing each other, and only
            # the late one is rejected.
            if used_ago > self._refresh_reuse_grace_sec:
                await self._sessions.revoke_session(sid, "refresh_token_reuse")
            raise InvalidToken()
        await self._sessions.ensure_active(claims)

        await self._blacklist.invalidar(jti, self._refresh_ttl_seconds)
        subject_id = UUID(str(claims["sub"]))
        role = str(claims["role"])
        extra = {"guardian_id": str(claims["guardian_id"])} if "guardian_id" in claims else {}
        return self._issue_token_pair(subject_id, role, extra=extra, sid=sid)

    async def logout(self, refresh_token: str) -> None:
        claims = self._tokens.decodificar(refresh_token)
        jti = claims.get("jti")
        if isinstance(jti, str):
            await self._blacklist.invalidar(jti, self._refresh_ttl_seconds)
        sid = claims.get("sid")
        await self._sessions.revoke_session(sid if isinstance(sid, str) else None, "logout")
        subject = claims.get("sub")
        if isinstance(subject, str):
            await self._portal_access.revocar(UUID(subject))

    # "Close all my sessions": every token issued before now stops working,
    # the ones of the person asking included.
    async def logout_all(self, subject_id: UUID) -> None:
        await self._sessions.revoke_all(subject_id, "user_request")
        await self._portal_access.revocar(subject_id)

    async def validate_access_token(self, access_token: str) -> dict[str, object]:
        claims = self._tokens.decodificar(access_token)
        if claims.get("type") != "access":
            raise InvalidToken()
        await self._sessions.ensure_active(claims)
        return claims

    def _issue_token_pair(
        self, subject_id: UUID, role: str, extra: dict[str, str] | None = None, sid: str | None = None
    ) -> IssuedTokens:
        # A new login starts a new session (new sid), a refresh keeps the same one.
        session_id = sid or str(uuid.uuid4())
        access = self._tokens.emitir_access_token(subject_id, role, extra or {}, session_id)
        refresh, _jti = self._tokens.emitir_refresh_token(subject_id, role, session_id)
        return IssuedTokens(access_token=access, refresh_token=refresh)
