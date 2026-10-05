# Checks and revokes sessions over the SessionRegistry port (Redis), and
# keeps the session history in the database: when each adult's session
# started, was last used and ended, and from which browser and system.

from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable
from uuid import UUID

from app.domain.entities import SESSION_END_REASONS, SESSION_ROLES, SessionRecord
from app.domain.exceptions import InvalidToken
from app.domain.ports import SessionRegistry, UnitOfWork
from app.domain.user_agent import describe_user_agent
from app.security_log import log_security_event

UowFactory = Callable[[], UnitOfWork]


class SessionService:
    def __init__(self, registry: SessionRegistry, ttl_seconds: int, uow_factory: UowFactory) -> None:
        self._registry = registry
        self._ttl_seconds = ttl_seconds
        self._uow_factory = uow_factory

    # Called for every authenticated request, here and in the other services
    # (through the internal validation route). Tokens without a sid are older
    # than this feature, they only get the "close all" check.
    async def ensure_active(self, claims: dict[str, object]) -> None:
        sid = claims.get("sid")
        if isinstance(sid, str) and await self._registry.sesion_revocada(sid):
            raise InvalidToken("La sesión ya no es válida. Inicia sesión de nuevo.")
        subject = claims.get("sub")
        issued_at = claims.get("iat")
        if isinstance(subject, str) and isinstance(issued_at, int | float):
            if await self._registry.emitida_antes_del_cierre(UUID(subject), int(issued_at)):
                raise InvalidToken("La sesión ya no es válida. Inicia sesión de nuevo.")

    # A guardian or teacher just signed in (or registered). Students are not
    # kept, see SESSION_ROLES.
    async def record_start(self, person_id: UUID, role: str, session_id: str, user_agent: str | None) -> None:
        if role not in SESSION_ROLES:
            return
        browser, operating_system = describe_user_agent(user_agent)
        async with self._uow_factory() as uow:
            await uow.session_history.add(
                SessionRecord(
                    session_id=session_id,
                    person_id=person_id,
                    role=role,
                    started_at=_now(),
                    browser=browser,
                    operating_system=operating_system,
                )
            )
            await uow.commit()
        log_security_event("session_started", sid=session_id, role=role, browser=browser, os=operating_system)

    # The session's token was renewed: it's still in use.
    async def record_activity(self, session_id: str) -> None:
        async with self._uow_factory() as uow:
            await uow.session_history.touch(session_id, _now())
            await uow.commit()

    async def revoke_session(self, sid: str | None, reason: str) -> None:
        if sid:
            await self._registry.revocar_sesion(sid, self._ttl_seconds)
            if reason != "logout":
                log_security_event("session_revoked", reason=reason, sid=sid)
            if reason in SESSION_END_REASONS:
                async with self._uow_factory() as uow:
                    await uow.session_history.end(sid, _now(), reason)
                    await uow.commit()

    async def revoke_all(self, subject_id: UUID, reason: str) -> None:
        await self._registry.cerrar_todas(subject_id, self._ttl_seconds)
        log_security_event("all_sessions_closed", reason=reason, subject=subject_id)
        # A student's subject has no rows, and their reasons (a new PIN) are
        # not in the list, so only adults' sessions end here.
        if reason in SESSION_END_REASONS:
            async with self._uow_factory() as uow:
                await uow.session_history.end_all(subject_id, _now(), reason)
                await uow.commit()


def _now() -> datetime:
    return datetime.now(timezone.utc)
