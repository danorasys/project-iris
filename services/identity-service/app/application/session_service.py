# Checks and revokes sessions. Pure orchestration over the SessionRegistry port.

from __future__ import annotations

from uuid import UUID

from app.domain.exceptions import InvalidToken
from app.domain.ports import SessionRegistry
from app.security_log import log_security_event


class SessionService:
    def __init__(self, registry: SessionRegistry, ttl_seconds: int) -> None:
        self._registry = registry
        self._ttl_seconds = ttl_seconds

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

    async def revoke_session(self, sid: str | None, reason: str) -> None:
        if sid:
            await self._registry.revocar_sesion(sid, self._ttl_seconds)
            if reason != "logout":
                log_security_event("session_revoked", reason=reason, sid=sid)

    async def revoke_all(self, subject_id: UUID, reason: str) -> None:
        await self._registry.cerrar_todas(subject_id, self._ttl_seconds)
        log_security_event("all_sessions_closed", reason=reason, subject=subject_id)
