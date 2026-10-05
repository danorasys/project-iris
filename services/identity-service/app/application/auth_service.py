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
from app.domain.entities import Consent, Guardian, Person, Student, Teacher, TeacherConsent
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
    InvalidToken,
    RefreshTokenJustUsed,
    ResourceNotFound,
)
from app.application.session_service import SessionService
from app.application.support_conditions import check_support_conditions
from app.domain.ports import (
    AttemptLockout,
    PasswordHasher,
    PortalAccessStore,
    SessionMfaStore,
    TokenBlacklist,
    TokenIssuer,
    UnitOfWork,
)
from app.security_log import log_security_event

UowFactory = Callable[[], "UnitOfWork"]

# Claim of a teacher's access token once that session passed the 2FA code.
# Every service checks it before letting a teacher do anything.
MFA_CLAIM = "mfa"
MFA_VERIFIED = "1"


# Emails and IPs go into lock keys as a hash, so Redis never holds them as text.
def _anon(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]


# Key of the per account lock of the login. Changing the password uses it
# too, so both forms share the same budget of wrong passwords.
def login_account_key(email: str) -> str:
    return f"login-account:{_anon(email.lower())}"


# Key of the lock for wrong PINs of a kid. Changing the PIN clears it.
def student_pin_key(student_id: UUID) -> str:
    return f"pin:{student_id}"


class AuthService:
    def __init__(
        self,
        uow_factory: UowFactory,
        password_hasher: PasswordHasher,
        token_issuer: TokenIssuer,
        blacklist: TokenBlacklist,
        portal_access: PortalAccessStore,
        session_mfa: SessionMfaStore,
        sessions: SessionService,
        login_lockout: AttemptLockout,
        account_lockout: AttemptLockout,
        pin_lockout: AttemptLockout,
        refresh_ttl_seconds: int,
        refresh_reuse_grace_sec: int,
        portal_access_ttl_sec: int,
        portal_access_max_age_sec: int,
    ) -> None:
        self._uow_factory = uow_factory
        self._hasher = password_hasher
        self._tokens = token_issuer
        self._blacklist = blacklist
        self._portal_access = portal_access
        self._session_mfa = session_mfa
        self._sessions = sessions
        self._login_lockout = login_lockout
        self._account_lockout = account_lockout
        self._pin_lockout = pin_lockout
        self._refresh_ttl_seconds = refresh_ttl_seconds
        self._refresh_reuse_grace_sec = refresh_reuse_grace_sec
        self._portal_access_ttl_sec = portal_access_ttl_sec
        self._portal_access_max_age_sec = portal_access_max_age_sec

    async def register_guardian(
        self,
        guardian_data: GuardianData,
        student_data: FirstStudentData,
        consent_data: ConsentData,
        user_agent: str | None = None,
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
            await check_support_conditions(
                uow, student_data.support_condition_ids, student_data.support_condition_other
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
                support_condition_ids=student_data.support_condition_ids,
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
        # Registering also signs in, so it starts the first session.
        await self._sessions.record_start(person.id, "guardian", tokens.session_id, user_agent)
        return person, guardian, student, tokens

    async def register_teacher(
        self, data: TeacherData, user_agent: str | None = None
    ) -> tuple[Person, Teacher, IssuedTokens]:
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
                phone_country_code=data.phone_country_code,
                phone_number=data.phone_number,
                date_of_birth=data.date_of_birth,
                document_issued_at=data.document_issued_at,
            )
            teacher = Teacher(id=uuid.uuid4(), person_id=person.id, institution=data.institution)
            await uow.people.add(person)
            await uow.teachers.add(teacher)
            await uow.flush()
            # Accepting the data treatment is part of creating the account, so
            # there's never a teacher without it.
            await uow.teacher_consents.add(
                TeacherConsent(
                    id=uuid.uuid4(),
                    teacher_id=teacher.id,
                    policy_version=data.consent_policy_version,
                    granted_at=person.created_at,
                    accepts_data_processing=True,
                )
            )
            # The profile is optional here, and goes in the same transaction.
            if data.profile is not None:
                await uow.teacher_profiles.replace(teacher.id, data.profile)
            await uow.commit()

        tokens = self._issue_token_pair(person.id, "teacher")
        await self._sessions.record_start(person.id, "teacher", tokens.session_id, user_agent)
        return person, teacher, tokens

    async def login(
        self, email: str, password: str, client_ip: str, user_agent: str | None = None
    ) -> tuple[Person, str, IssuedTokens]:
        # Two locks: one per IP and email (so a stranger can't lock a victim
        # out from another IP) and one per email alone, with a higher limit, so
        # trying from many IPs doesn't give unlimited guesses.
        ip_key = f"login:{_anon(client_ip)}:{_anon(email.lower())}"
        account_key = login_account_key(email)
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
        # A new login is a new session, and the portal access belongs to a
        # session, so this one starts closed without touching the others.
        tokens = self._issue_token_pair(person.id, role)
        await self._sessions.record_start(person.id, role, tokens.session_id, user_agent)
        return person, role, tokens

    async def login_student_profile(self, student_id: UUID, pin: str) -> tuple[Student, IssuedTokens]:
        limit_key = student_pin_key(student_id)
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
            raise RefreshTokenJustUsed()
        await self._sessions.ensure_active(claims)

        await self._blacklist.invalidar(jti, self._refresh_ttl_seconds)
        subject_id = UUID(str(claims["sub"]))
        role = str(claims["role"])
        extra = {"guardian_id": str(claims["guardian_id"])} if "guardian_id" in claims else {}
        # A teacher whose session already passed the 2FA code keeps it.
        if role == "teacher" and sid is not None and await self._session_mfa.is_verified(subject_id, sid):
            extra[MFA_CLAIM] = MFA_VERIFIED
        if sid is not None:
            await self._sessions.record_activity(sid)
        return self._issue_token_pair(subject_id, role, extra=extra, sid=sid)

    # Closes the session of the refresh token. It doesn't need the access
    # token, so it also works when that one already expired. A token that
    # isn't valid anymore has nothing left to close.
    async def logout(self, refresh_token: str) -> None:
        try:
            claims = self._tokens.decodificar(refresh_token)
        except InvalidToken:
            return
        if claims.get("type") != "refresh":
            return
        jti = claims.get("jti")
        if isinstance(jti, str):
            await self._blacklist.invalidar(jti, self._refresh_ttl_seconds)
        sid = claims.get("sid")
        await self._sessions.revoke_session(sid if isinstance(sid, str) else None, "logout")
        subject = claims.get("sub")
        if isinstance(subject, str) and isinstance(sid, str):
            await self._portal_access.revocar(UUID(subject), sid)
        if isinstance(sid, str):
            await self._session_mfa.forget(sid)

    # "Close all my sessions": every token issued before now stops working,
    # the ones of the person asking included.
    async def logout_all(self, subject_id: UUID) -> None:
        await self._sessions.revoke_all(subject_id, "user_request")
        await self._portal_access.revocar_todas(subject_id)

    # Right after a teacher types a good 2FA code: a new access token for the
    # same session, now with the mfa claim. The refresh token doesn't change,
    # refresh() adds the claim again while the session stays verified.
    def issue_verified_access_token(self, subject_id: UUID, session_id: str) -> str:
        return self._tokens.emitir_access_token(subject_id, "teacher", {MFA_CLAIM: MFA_VERIFIED}, session_id)

    # Used by the other services. A teacher's token keeps its mfa claim for
    # the whole session, but the panel closes after a while without activity
    # (like the parents' portal), so then the claim is left out and every
    # service answers that the 2FA code is needed. renew=False is for the
    # requests the page makes by itself, they don't count as activity.
    async def validate_access_token(self, access_token: str, renew: bool = True) -> dict[str, object]:
        claims = self._tokens.decodificar(access_token)
        if claims.get("type") != "access":
            raise InvalidToken()
        await self._sessions.ensure_active(claims)
        if claims.get("role") == "teacher" and claims.get(MFA_CLAIM) == MFA_VERIFIED:
            sid = claims.get("sid")
            subject = UUID(str(claims["sub"]))
            if not isinstance(sid, str) or not await self.teacher_access_open(subject, sid, renew):
                claims = {key: value for key, value in claims.items() if key != MFA_CLAIM}
        return claims

    # Whether the teacher typed their 2FA code in this session recently
    # enough. With renew, this request counts as activity and the 15 min
    # start again (never past the 2 h since the code).
    async def teacher_access_open(self, person_id: UUID, session_id: str, renew: bool) -> bool:
        if renew:
            return await self._portal_access.renovar(
                person_id, session_id, self._portal_access_ttl_sec, self._portal_access_max_age_sec
            )
        return await self._portal_access.esta_abierto(person_id, session_id, self._portal_access_max_age_sec)

    def _issue_token_pair(
        self, subject_id: UUID, role: str, extra: dict[str, str] | None = None, sid: str | None = None
    ) -> IssuedTokens:
        # A new login starts a new session (new sid), a refresh keeps the same one.
        session_id = sid or str(uuid.uuid4())
        access = self._tokens.emitir_access_token(subject_id, role, extra or {}, session_id)
        refresh, _jti = self._tokens.emitir_refresh_token(subject_id, role, session_id)
        return IssuedTokens(access_token=access, refresh_token=refresh, session_id=session_id)
