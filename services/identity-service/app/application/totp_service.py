# 2FA (TOTP) use cases for guardian accounts.
#
# Pure orchestration, like auth_service.py — no pyotp, qrcode or cryptography
# imports here, only the ports defined in app.domain.ports.

from __future__ import annotations

from typing import Callable
from uuid import UUID

from app.application.dtos import TotpSetupResult
from app.domain.exceptions import (
    AttemptLimitExceeded,
    InvalidTotpCode,
    ResourceNotFound,
    SessionClosedForSecurity,
    TotpNotEnabled,
    TotpSetupNotStarted,
)
from app.application.session_service import SessionService
from app.domain.ports import AttemptLockout, PortalAccessStore, RateLimiter, TotpEncryptor, TotpProvider, UnitOfWork
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
        self._verify_valid_window = verify_valid_window

    # Generates a fresh secret and its QR code. Calling this again before
    # verify() overwrites the previous secret (e.g. the guardian reloaded the
    # page) — totp_enabled stays False either way until verify() succeeds,
    # so this can't accidentally re-lock an already-protected account.
    async def setup(self, person_id: UUID) -> TotpSetupResult:
        async with self._uow_factory() as uow:
            guardian = await uow.guardians.get_by_person_id(person_id)
            if guardian is None:
                raise ResourceNotFound("No existe un tutor asociado a esta cuenta.")
            person = await uow.people.get_by_id(person_id)
            if person is None:
                raise ResourceNotFound("No existe una cuenta asociada a este tutor.")

            secret = self._totp.generar_secreto()
            uri = self._totp.uri_aprovisionamiento(secret, person.email, self._issuer_name)
            qr_code_data_uri = self._totp.codigo_qr_base64(uri)

            await uow.guardians.update_totp(guardian.id, self._encryptor.encrypt(secret), False)
            await uow.commit()

        return TotpSetupResult(qr_code_data_uri=qr_code_data_uri, manual_entry_key=secret)

    async def verify(self, person_id: UUID, code: str) -> None:
        limit_key = f"totp:{person_id}"
        if not await self._rate_limiter.permitir(limit_key, self._rate_limit_verify_max, self._rate_limit_verify_window_sec):
            raise AttemptLimitExceeded(retry_after_seconds=await self._rate_limiter.segundos_restantes(limit_key))

        async with self._uow_factory() as uow:
            guardian = await uow.guardians.get_by_person_id(person_id)
            if guardian is None:
                raise ResourceNotFound("No existe un tutor asociado a esta cuenta.")
            if guardian.totp_secret is None:
                raise TotpSetupNotStarted()

            secret = self._encryptor.decrypt(guardian.totp_secret)
            if not self._totp.verificar(secret, code, self._verify_valid_window):
                raise InvalidTotpCode()

            await uow.guardians.update_totp(guardian.id, guardian.totp_secret, True)
            await uow.commit()

        # Finishing the setup proves the guardian holds the app, and it is the
        # step right before the first time they enter the portal.
        await self._portal_access.conceder(person_id, self._portal_access_ttl_sec)

    # Checked before the parents' portal, so a session left open on a shared
    # computer can't get in. A good code opens the portal for a while (see
    # PortalAccessStore). Wrong codes are counted per session, so a stolen
    # token only locks itself and not the real guardian, and the second lock
    # closes that session. A higher cap per account bounds all sessions
    # together. Returns how many wrong attempts happened since the last time
    # the guardian got in, so the portal can warn about them.
    async def confirm_portal_access(self, person_id: UUID, session_id: str | None, code: str) -> int:
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
            guardian = await uow.guardians.get_by_person_id(person_id)
            if guardian is None:
                raise ResourceNotFound("No existe un tutor asociado a esta cuenta.")
            if guardian.totp_secret is None or not guardian.totp_enabled:
                raise TotpNotEnabled()

        secret = self._encryptor.decrypt(guardian.totp_secret)
        # A code lives about 90 s (30 s steps, one step of tolerance each side).
        # Accepting it only once stops someone who saw it from reusing it. The
        # rate limiter works here as a one-shot marker.
        is_valid = self._totp.verificar(secret, code, self._verify_valid_window) and await self._rate_limiter.permitir(
            f"portal-2fa-used:{person_id}:{code}", 1, 90
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
        missed_attempts = await self._rate_limiter.intentos(alert_key)
        await self._rate_limiter.olvidar(alert_key)
        await self._portal_access.conceder(person_id, self._portal_access_ttl_sec)
        return missed_attempts
