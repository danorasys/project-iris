# Changing the password from inside the account, for guardians and teachers
# alike. The route checks the 2FA code first; this checks the current
# password, with the same locks as the login, and then closes every session.

from __future__ import annotations

from typing import Callable
from uuid import UUID

from app.application.auth_service import login_account_key
from app.application.session_service import SessionService
from app.domain.exceptions import AttemptLimitExceeded, PasswordSameAsCurrent, ResourceNotFound, WrongCurrentPassword
from app.domain.ports import AttemptLockout, PasswordHasher, UnitOfWork
from app.security_log import log_security_event

UowFactory = Callable[[], UnitOfWork]


class PasswordChangeService:
    def __init__(
        self,
        uow_factory: UowFactory,
        password_hasher: PasswordHasher,
        sessions: SessionService,
        password_lockout: AttemptLockout,
        account_lockout: AttemptLockout,
    ) -> None:
        self._uow_factory = uow_factory
        self._hasher = password_hasher
        self._sessions = sessions
        self._password_lockout = password_lockout
        self._account_lockout = account_lockout

    async def change_password(self, person_id: UUID, current_password: str, new_password: str) -> None:
        async with self._uow_factory() as uow:
            person = await uow.people.get_by_id(person_id)
            if person is None:
                raise ResourceNotFound("No existe esta cuenta.")

        # Wrong current passwords count here and on the login too, so this
        # form can't be used to guess the password around the login's lock.
        form_key = f"password-change:{person_id}"
        account_key = login_account_key(person.email)
        wait = max(
            await self._password_lockout.segundos_bloqueado(form_key),
            await self._account_lockout.segundos_bloqueado(account_key),
        )
        if wait:
            raise AttemptLimitExceeded(retry_after_seconds=wait)

        if not self._hasher.verificar(current_password, person.hash_password):
            wait = max(
                await self._password_lockout.registrar_fallo(form_key),
                await self._account_lockout.registrar_fallo(account_key),
            )
            if wait:
                log_security_event("password_change_locked", person=person_id, wait=wait)
                raise AttemptLimitExceeded(retry_after_seconds=wait)
            raise WrongCurrentPassword()

        await self._password_lockout.registrar_exito(form_key)
        # The schema already refuses the same text, but bcrypt only reads 72
        # bytes, so a long one changed after that would still match the hash.
        if self._hasher.verificar(new_password, person.hash_password):
            raise PasswordSameAsCurrent()
        async with self._uow_factory() as uow:
            await uow.people.update_password(person_id, self._hasher.hash(new_password))
            await uow.commit()
        await self._sessions.revoke_all(person_id, "password_changed")
