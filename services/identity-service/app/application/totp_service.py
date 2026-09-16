# 2FA (TOTP) use cases for guardian accounts.
#
# Pure orchestration, like auth_service.py — no pyotp, qrcode or cryptography
# imports here, only the ports defined in app.domain.ports.

from __future__ import annotations

from typing import Callable
from uuid import UUID

from app.application.dtos import TotpSetupResult
from app.domain.exceptions import AttemptLimitExceeded, InvalidTotpCode, ResourceNotFound, TotpSetupNotStarted
from app.domain.ports import RateLimiter, TotpEncryptor, TotpProvider, UnitOfWork

UowFactory = Callable[[], "UnitOfWork"]


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
        verify_valid_window: int = 1,
    ) -> None:
        self._uow_factory = uow_factory
        self._totp = totp_provider
        self._encryptor = encryptor
        self._rate_limiter = rate_limiter
        self._issuer_name = issuer_name
        self._rate_limit_verify_max = rate_limit_verify_max
        self._rate_limit_verify_window_sec = rate_limit_verify_window_sec
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
            raise AttemptLimitExceeded()

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
