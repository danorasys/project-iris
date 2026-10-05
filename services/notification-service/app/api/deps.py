from __future__ import annotations

from functools import lru_cache
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis, from_url

from app.application.notification_service import NotificationService
from app.config import get_settings
from app.correlation import get_correlation_id
from app.domain.exceptions import InvalidToken, PermissionDenied, PortalAccessRequired, TwoFactorRequired
from app.infrastructure.http_clients.circuit_breaker import CircuitBreaker
from app.infrastructure.http_clients.identity_client import IdentityClient
from app.infrastructure.uow import SqlAlchemyUnitOfWork

_bearer = HTTPBearer(auto_error=False)


@lru_cache
def get_redis() -> Redis:
    return from_url(get_settings().redis_url, decode_responses=True)


@lru_cache
def get_http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient()


@lru_cache
def get_circuit_breaker() -> CircuitBreaker:
    settings = get_settings()
    return CircuitBreaker(
        failure_threshold=settings.circuit_breaker_failure_threshold,
        recovery_seconds=settings.circuit_breaker_recovery_seconds,
    )


@lru_cache
def get_identity_client() -> IdentityClient:
    settings = get_settings()
    return IdentityClient(
        http_client=get_http_client(),
        base_url=settings.identity_service_url,
        internal_service_key=settings.internal_service_key,
        timeout_sec=settings.identity_http_timeout_sec,
        circuit_breaker=get_circuit_breaker(),
        cache_ttl_seconds=settings.auth_cache_ttl_seconds,
    )


def get_notification_service() -> NotificationService:
    return NotificationService(uow_factory=SqlAlchemyUnitOfWork)


class CurrentUser:
    def __init__(
        self, subject_id: UUID, role: str, session_id: str | None = None, mfa_verified: bool = False
    ) -> None:
        self.subject_id = subject_id
        self.role = role
        self.session_id = session_id
        # The session already passed the 2FA code (only teachers use it here).
        self.mfa_verified = mfa_verified


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    identity: Annotated[IdentityClient, Depends(get_identity_client)],
) -> CurrentUser:
    # Same pattern as the other services: notification-service never sees
    # JWT_SECRET, it validates the token by calling identity-service.
    if credentials is None:
        raise InvalidToken("Falta el encabezado de autorización.")
    claims = await identity.validate_token(credentials.credentials, get_correlation_id())
    return CurrentUser(
        subject_id=UUID(claims.sub),
        role=claims.role,
        session_id=claims.extra.get("sid"),
        mfa_verified=claims.extra.get("mfa") == "1",
    )


def require_role(*allowed_roles: str):
    async def _dep(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        if user.role not in allowed_roles:
            raise PermissionDenied("Tu tipo de cuenta no tiene acceso a esta operación.")
        # A teacher only gets in from a session that passed the 2FA code.
        if user.role == "teacher" and not user.mfa_verified:
            raise TwoFactorRequired()
        return user

    return _dep


# A teacher or a guardian. A guardian's notifications talk about their kids,
# so they need the portal's 2FA access, same as the rest of the parents'
# portal. renew=False for reading the tray, so a tab left open doesn't keep
# the portal open; reading or deleting one does count as using it.
def require_tray_owner(renew: bool):
    async def _dep(
        user: Annotated[CurrentUser, Depends(require_role("teacher", "guardian"))],
        identity: Annotated[IdentityClient, Depends(get_identity_client)],
    ) -> CurrentUser:
        if user.role == "guardian":
            if user.session_id is None:
                raise PortalAccessRequired()
            await identity.check_portal_access(str(user.subject_id), user.session_id, renew, get_correlation_id())
        return user

    return _dep
