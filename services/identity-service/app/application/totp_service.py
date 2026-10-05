# 2FA (TOTP) use cases. The code belongs to the account, so it's the same
# for guardians (portal) and teachers (panel). Only ports here, no pyotp
# or cryptography imports.

from __future__ import annotations

from typing import Callable
from uuid import UUID

from app.application.dtos import TotpSetupResult
from app.domain.exceptions import (
    AttemptLimitExceeded,
    InvalidTotpCode,
    ResourceNotFound,
    SessionClosedForSecurity,
    TotpAlreadyEnabled,
    TotpNotEnabled,
    TotpSetupNotStarted,
)
from app.application.session_service import SessionService
from app.domain.entities import Person
from app.domain.ports import (
    AttemptLockout,
    PortalAccessStore,
    RateLimiter,
    SessionMfaStore,
    TotpEncryptor,
    TotpProvider,
    UnitOfWork,
)
from app.security_log import log_security_event

UowFactory = Callable[[], "UnitOfWork"]

# The second time a session gets locked at the portal, it is closed and the
# person has to log in again with the password.
CLOSE_SESSION_AT_LOCK_LEVEL = 2

# The wrong code counter for the portal notice has no real cap, it only counts
# for a week. It uses the rate limiter just because it already counts with expiry.
_ALERT_COUNT_CAP = 1_000_000
_ALERT_TTL_SEC = 7 * 24 * 3600


class TotpService:
    def __init__(
        self,
        uow_factory: UowFactory,
        totp_provider: TotpProvider,
        encryptor: TotpEncryptor,
        rate_limiter: RateLimiter,
        issuer_name: str,
        rate_limit_verify_max: int,
        rate_limit_verify_window_sec: int,
        portal_access: PortalAccessStore,
        portal_access_ttl_sec: int,
        lockout: AttemptLockout,
        account_lockout: AttemptLockout,
        sessions: SessionService,
        session_mfa: SessionMfaStore,
        session_mfa_ttl_sec: int,
        verify_valid_window: int = 1,
    ) -> None:
        self._uow_factory = uow_factory
        self._totp = totp_provider
        self._encryptor = encryptor
        self._rate_limiter = rate_limiter
        self._issuer_name = issuer_name
        self._rate_limit_verify_max = rate_limit_verify_max
        self._rate_limit_verify_window_sec = rate_limit_verify_window_sec
        self._portal_access = portal_access
        self._portal_access_ttl_sec = portal_access_ttl_sec
        self._lockout = lockout
        self._account_lockout = account_lockout
        self._sessions = sessions
        self._session_mfa = session_mfa
        self._session_mfa_ttl_sec = session_mfa_ttl_sec
        self._verify_valid_window = verify_valid_window

    # Generates a fresh secret and its QR code. Calling this again before
    # verify() overwrites the previous secret (e.g. the page was reloaded).
    # Once the 2FA is on it is refused: otherwise anyone with just the
    # password could turn it off and put their own phone.
    async def setup(self, person_id: UUID) -> TotpSetupResult:
        async with self._uow_factory() as uow:
            person = await _account(uow, person_id)
            if person.totp_enabled:
                log_security_event("totp_setup_refused", person=person_id)
                raise TotpAlreadyEnabled()
            secret = self._totp.generar_secreto()
            uri = self._totp.uri_aprovisionamiento(secret, person.email, self._issuer_name)
            qr_code_data_uri = self._totp.codigo_qr_base64(uri)

            await uow.people.update_totp(person.id, self._encryptor.encrypt(secret), False)
            await uow.commit()

        return TotpSetupResult(qr_code_data_uri=qr_code_data_uri, manual_entry_key=secret)

    async def is_enabled(self, person_id: UUID) -> bool:
        async with self._uow_factory() as uow:
            person = await _account(uow, person_id)
        return person.totp_enabled

    # Turns 2FA on with the first good code. That same code also opens what
    # comes right after: the parents' portal for a guardian, or the panel for
    # a teacher (their session is marked as verified).
    async def verify(self, person_id: UUID, session_id: str | None, code: str, role: str) -> None:
        limit_key = f"totp:{person_id}"
        if not await self._rate_limiter.permitir(limit_key, self._rate_limit_verify_max, self._rate_limit_verify_window_sec):
            raise AttemptLimitExceeded(retry_after_seconds=await self._rate_limiter.segundos_restantes(limit_key))

        async with self._uow_factory() as uow:
            person = await _account(uow, person_id)
            if person.totp_enabled:
                raise TotpAlreadyEnabled()
            if person.totp_secret is None:
                raise TotpSetupNotStarted()

            secret = self._encryptor.decrypt(person.totp_secret)
            if not self._totp.verificar(secret, code, self._verify_valid_window):
                raise InvalidTotpCode()

            await uow.people.update_totp(person.id, person.totp_secret, True)
            await uow.commit()

        # Without a session id there is nothing to tie the access to (every
        # token IRIS issues today carries one).
        if session_id is None:
            return
        if role == "teacher":
            await self._session_mfa.mark_verified(person_id, session_id, self._session_mfa_ttl_sec)
        # The panel or the portal stays open while it's used (see PortalAccessStore).
        await self._portal_access.conceder(person_id, session_id, self._portal_access_ttl_sec)

    # Checked before the parents' portal, so a session left open on a shared
    # computer can't get in. A good code opens the portal for a while (see
    # PortalAccessStore). Returns how many wrong attempts happened since the
    # last time the guardian got in, so the portal can warn about them.
    async def confirm_portal_access(self, person_id: UUID, session_id: str | None, code: str) -> int:
        await self._check_code(person_id, session_id, code)
        alert_key = f"portal-2fa-alert:{person_id}"
        missed_attempts = await self._rate_limiter.intentos(alert_key)
        await self._rate_limiter.olvidar(alert_key)
        # Without a session id there is nothing to tie the access to, so the
        # portal stays closed (every token IRIS issues today carries one).
        if session_id is not None:
            await self._portal_access.conceder(person_id, session_id, self._portal_access_ttl_sec)
        return missed_attempts

    # Asked when a teacher opens their panel, and again after a while
    # without activity. A good code marks the session as verified and opens
    # the panel for a while, like the parents' portal.
    async def confirm_teacher_session(self, person_id: UUID, session_id: str | None, code: str) -> None:
        await self._check_code(person_id, session_id, code)
        if session_id is not None:
            await self._session_mfa.mark_verified(person_id, session_id, self._session_mfa_ttl_sec)
            await self._portal_access.conceder(person_id, session_id, self._portal_access_ttl_sec)

    # Asked right before a sensitive change (the password), so both factors
    # are proven at that moment.
    async def confirm_sensitive_action(self, person_id: UUID, session_id: str | None, code: str) -> None:
        await self._check_code(person_id, session_id, code)

    # Gives back a good code when the change after it failed for another
    # reason (a wrong current password), so the guardian can fix the form
    # and send it again without waiting for a new code.
    async def release_code(self, person_id: UUID, code: str) -> None:
        await self._rate_limiter.olvidar(_used_code_key(person_id, code))

    # Wrong codes are counted per session, so a stolen token only locks itself
    # and not the real person. A higher cap per account bounds all sessions
    # together, and the second lock closes that session.
    async def _check_code(self, person_id: UUID, session_id: str | None, code: str) -> None:
        session_key = f"portal-2fa:{person_id}:{session_id or 'no-session'}"
        account_key = f"portal-2fa-account:{person_id}"
        alert_key = f"portal-2fa-alert:{person_id}"
        wait = max(
            await self._lockout.segundos_bloqueado(session_key),
            await self._account_lockout.segundos_bloqueado(account_key),
        )
        if wait:
            raise AttemptLimitExceeded(retry_after_seconds=wait)

        async with self._uow_factory() as uow:
            person = await _account(uow, person_id)
        if person.totp_secret is None or not person.totp_enabled:
            raise TotpNotEnabled()

        secret = self._encryptor.decrypt(person.totp_secret)
        # A code lives about 90 s, so each one is accepted only once. The
        # counter is taken in one step (INCR), so two requests at the same
        # time with the same code can't both get in.
        is_valid = self._totp.verificar(secret, code, self._verify_valid_window) and await self._rate_limiter.permitir(
            _used_code_key(person_id, code), 1, 90
        )
        if not is_valid:
            await self._rate_limiter.permitir(alert_key, _ALERT_COUNT_CAP, _ALERT_TTL_SEC)
            session_wait = await self._lockout.registrar_fallo(session_key)
            account_wait = await self._account_lockout.registrar_fallo(account_key)
            if session_wait or account_wait:
                log_security_event(
                    "portal_2fa_locked", person=person_id, session_wait=session_wait, account_wait=account_wait
                )
            if session_wait and await self._lockout.nivel(session_key) >= CLOSE_SESSION_AT_LOCK_LEVEL:
                await self._sessions.revoke_session(session_id, "portal_2fa_repeated_lock")
                raise SessionClosedForSecurity()
            if session_wait or account_wait:
                raise AttemptLimitExceeded(retry_after_seconds=max(session_wait, account_wait))
            raise InvalidTotpCode()

        await self._lockout.registrar_exito(session_key)


async def _account(uow: UnitOfWork, person_id: UUID) -> Person:
    person = await uow.people.get_by_id(person_id)
    if person is None:
        raise ResourceNotFound("No existe esta cuenta.")
    return person


def _used_code_key(person_id: UUID, code: str) -> str:
    return f"portal-2fa-used:{person_id}:{code}"
