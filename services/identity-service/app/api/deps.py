from __future__ import annotations

import secrets
from functools import lru_cache
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis, from_url

from app.application.auth_service import AuthService
from app.application.catalog_service import CatalogQueryService
from app.application.guardian_service import GuardianService
from app.application.internal_service import InternalQueryService
from app.application.session_service import SessionService
from app.application.student_service import StudentService
from app.application.totp_service import TotpService
from app.application.user_service import UserQueryService
from app.config import Settings, get_settings
from app.domain.exceptions import InvalidToken, PermissionDenied, PortalAccessRequired, UnauthorizedInternalAccess
from app.infrastructure.redis_gateway import (
    RedisAttemptLockout,
    RedisPortalAccessStore,
    RedisRateLimiter,
    RedisSessionRegistry,
    RedisTokenBlacklist,
)
from app.infrastructure.security import BcryptPasswordHasher, FernetTotpEncryptor, JoseTokenIssuer, PyotpTotpProvider
from app.infrastructure.uow import SqlAlchemyUnitOfWork

_bearer = HTTPBearer(auto_error=False)


@lru_cache
def get_password_hasher() -> BcryptPasswordHasher:
    return BcryptPasswordHasher()


@lru_cache
def get_token_issuer() -> JoseTokenIssuer:
    settings = get_settings()
    return JoseTokenIssuer(
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        access_ttl_min=settings.jwt_access_ttl_min,
        refresh_ttl_days=settings.jwt_refresh_ttl_days,
    )


@lru_cache
def get_redis() -> Redis:
    return from_url(get_settings().redis_url, decode_responses=True)


def get_rate_limiter(redis: Annotated[Redis, Depends(get_redis)]) -> RedisRateLimiter:
    return RedisRateLimiter(redis)


def get_blacklist(redis: Annotated[Redis, Depends(get_redis)]) -> RedisTokenBlacklist:
    return RedisTokenBlacklist(redis)


def get_attempt_lockout(
    settings: Annotated[Settings, Depends(get_settings)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> RedisAttemptLockout:
    return RedisAttemptLockout(
        redis,
        max_failures=settings.lockout_max_failures,
        fails_window_sec=settings.lockout_fails_window_sec,
        wait_steps_sec=settings.lockout_wait_steps_sec,
        reset_after_sec=settings.lockout_reset_after_sec,
    )


def get_account_lockout(
    settings: Annotated[Settings, Depends(get_settings)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> RedisAttemptLockout:
    return RedisAttemptLockout(
        redis,
        max_failures=settings.account_lockout_max_failures,
        fails_window_sec=settings.account_lockout_fails_window_sec,
        wait_steps_sec=[settings.account_lockout_wait_sec],
        reset_after_sec=settings.lockout_reset_after_sec,
    )


def get_pin_lockout(
    settings: Annotated[Settings, Depends(get_settings)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> RedisAttemptLockout:
    return RedisAttemptLockout(
        redis,
        max_failures=settings.pin_lockout_max_failures,
        fails_window_sec=settings.pin_lockout_fails_window_sec,
        wait_steps_sec=settings.pin_lockout_wait_steps_sec,
        reset_after_sec=settings.lockout_reset_after_sec,
    )


def get_session_service(
    settings: Annotated[Settings, Depends(get_settings)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> SessionService:
    return SessionService(RedisSessionRegistry(redis), ttl_seconds=settings.jwt_refresh_ttl_days * 24 * 3600)


def get_portal_access_store(redis: Annotated[Redis, Depends(get_redis)]) -> RedisPortalAccessStore:
    return RedisPortalAccessStore(redis)


def get_auth_service(
    settings: Annotated[Settings, Depends(get_settings)],
    hasher: Annotated[BcryptPasswordHasher, Depends(get_password_hasher)],
    tokens: Annotated[JoseTokenIssuer, Depends(get_token_issuer)],
    blacklist: Annotated[RedisTokenBlacklist, Depends(get_blacklist)],
    portal_access: Annotated[RedisPortalAccessStore, Depends(get_portal_access_store)],
    sessions: Annotated[SessionService, Depends(get_session_service)],
    login_lockout: Annotated[RedisAttemptLockout, Depends(get_attempt_lockout)],
    account_lockout: Annotated[RedisAttemptLockout, Depends(get_account_lockout)],
    pin_lockout: Annotated[RedisAttemptLockout, Depends(get_pin_lockout)],
) -> AuthService:
    return AuthService(
        uow_factory=SqlAlchemyUnitOfWork,
        password_hasher=hasher,
        token_issuer=tokens,
        blacklist=blacklist,
        portal_access=portal_access,
        sessions=sessions,
        login_lockout=login_lockout,
        account_lockout=account_lockout,
        pin_lockout=pin_lockout,
        refresh_ttl_seconds=settings.jwt_refresh_ttl_days * 24 * 3600,
        refresh_reuse_grace_sec=settings.refresh_reuse_grace_sec,
    )


def get_guardian_service(
    hasher: Annotated[BcryptPasswordHasher, Depends(get_password_hasher)],
    sessions: Annotated[SessionService, Depends(get_session_service)],
) -> GuardianService:
    return GuardianService(uow_factory=SqlAlchemyUnitOfWork, password_hasher=hasher, sessions=sessions)


@lru_cache
def get_totp_provider() -> PyotpTotpProvider:
    return PyotpTotpProvider()


@lru_cache
def get_totp_encryptor() -> FernetTotpEncryptor:
    return FernetTotpEncryptor(get_settings().totp_encryption_key)


def get_totp_service(
    settings: Annotated[Settings, Depends(get_settings)],
    totp_provider: Annotated[PyotpTotpProvider, Depends(get_totp_provider)],
    encryptor: Annotated[FernetTotpEncryptor, Depends(get_totp_encryptor)],
    rate_limiter: Annotated[RedisRateLimiter, Depends(get_rate_limiter)],
    portal_access: Annotated[RedisPortalAccessStore, Depends(get_portal_access_store)],
    lockout: Annotated[RedisAttemptLockout, Depends(get_attempt_lockout)],
    account_lockout: Annotated[RedisAttemptLockout, Depends(get_account_lockout)],
    sessions: Annotated[SessionService, Depends(get_session_service)],
) -> TotpService:
    return TotpService(
        uow_factory=SqlAlchemyUnitOfWork,
        totp_provider=totp_provider,
        encryptor=encryptor,
        rate_limiter=rate_limiter,
        issuer_name=settings.totp_issuer_name,
        rate_limit_verify_max=settings.rate_limit_totp_max,
        rate_limit_verify_window_sec=settings.rate_limit_totp_window_sec,
        portal_access=portal_access,
        portal_access_ttl_sec=settings.portal_access_ttl_sec,
        lockout=lockout,
        account_lockout=account_lockout,
        sessions=sessions,
    )


def get_internal_query_service() -> InternalQueryService:
    return InternalQueryService(uow_factory=SqlAlchemyUnitOfWork)


def get_catalog_query_service() -> CatalogQueryService:
    return CatalogQueryService(uow_factory=SqlAlchemyUnitOfWork)


def get_student_service() -> StudentService:
    return StudentService(uow_factory=SqlAlchemyUnitOfWork)


def get_user_query_service() -> UserQueryService:
    return UserQueryService(uow_factory=SqlAlchemyUnitOfWork)


class CurrentUser:
    def __init__(self, subject_id: UUID, role: str, extra: dict[str, object], session_id: str | None = None) -> None:
        self.subject_id = subject_id
        self.role = role
        self.extra = extra
        self.session_id = session_id


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    tokens: Annotated[JoseTokenIssuer, Depends(get_token_issuer)],
    sessions: Annotated[SessionService, Depends(get_session_service)],
) -> CurrentUser:
    if credentials is None:
        raise InvalidToken("Falta el encabezado de autorización.")
    claims = tokens.decodificar(credentials.credentials)
    if claims.get("type") != "access":
        raise InvalidToken()
    await sessions.ensure_active(claims)
    subject_id = UUID(str(claims["sub"]))
    role = str(claims["role"])
    extra = {k: v for k, v in claims.items() if k not in {"sub", "role", "type", "iat", "exp", "sid"}}
    session_id = claims.get("sid")
    return CurrentUser(
        subject_id=subject_id, role=role, extra=extra, session_id=session_id if isinstance(session_id, str) else None
    )


def require_role(*allowed_roles: str):
    async def _dep(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        if user.role not in allowed_roles:
            raise PermissionDenied("Tu tipo de cuenta no tiene acceso a esta operación.")
        return user

    return _dep


async def require_portal_access(
    user: Annotated[CurrentUser, Depends(require_role("guardian"))],
    portal_access: Annotated[RedisPortalAccessStore, Depends(get_portal_access_store)],
) -> None:
    """Guards the parents' portal. The 2FA screen alone can't do it, since
    anyone with the open session could type the portal's URL."""
    if not await portal_access.esta_concedido(user.subject_id):
        raise PortalAccessRequired()


async def verify_internal_key(x_internal_key: Annotated[str | None, Header()] = None) -> None:
    settings = get_settings()
    # compare_digest instead of != so the comparison takes the same time
    # regardless of where the strings first differ, a defense-in-depth measure
    # against timing attacks on the shared key.
    if x_internal_key is None or not secrets.compare_digest(x_internal_key, settings.internal_service_key):
        raise UnauthorizedInternalAccess()
