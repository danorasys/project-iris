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
from app.application.student_service import StudentService
from app.application.totp_service import TotpService
from app.application.user_service import UserQueryService
from app.config import Settings, get_settings
from app.domain.exceptions import PermissionDenied, InvalidToken, UnauthorizedInternalAccess
from app.infrastructure.redis_gateway import RedisRateLimiter, RedisTokenBlacklist
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


def get_auth_service(
    settings: Annotated[Settings, Depends(get_settings)],
    hasher: Annotated[BcryptPasswordHasher, Depends(get_password_hasher)],
    tokens: Annotated[JoseTokenIssuer, Depends(get_token_issuer)],
    rate_limiter: Annotated[RedisRateLimiter, Depends(get_rate_limiter)],
    blacklist: Annotated[RedisTokenBlacklist, Depends(get_blacklist)],
) -> AuthService:
    return AuthService(
        uow_factory=SqlAlchemyUnitOfWork,
        password_hasher=hasher,
        token_issuer=tokens,
        rate_limiter=rate_limiter,
        blacklist=blacklist,
        rate_limit_login_max=settings.rate_limit_login_max,
        rate_limit_login_window_sec=settings.rate_limit_login_window_sec,
        rate_limit_pin_max=settings.rate_limit_pin_max,
        rate_limit_pin_window_sec=settings.rate_limit_pin_window_sec,
        refresh_ttl_seconds=settings.jwt_refresh_ttl_days * 24 * 3600,
    )


def get_guardian_service(
    settings: Annotated[Settings, Depends(get_settings)],
    hasher: Annotated[BcryptPasswordHasher, Depends(get_password_hasher)],
    rate_limiter: Annotated[RedisRateLimiter, Depends(get_rate_limiter)],
) -> GuardianService:
    return GuardianService(
        uow_factory=SqlAlchemyUnitOfWork,
        password_hasher=hasher,
        rate_limiter=rate_limiter,
        rate_limit_confirm_password_max=settings.rate_limit_confirm_password_max,
        rate_limit_confirm_password_window_sec=settings.rate_limit_confirm_password_window_sec,
    )


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
) -> TotpService:
    return TotpService(
        uow_factory=SqlAlchemyUnitOfWork,
        totp_provider=totp_provider,
        encryptor=encryptor,
        rate_limiter=rate_limiter,
        issuer_name=settings.totp_issuer_name,
        rate_limit_verify_max=settings.rate_limit_totp_max,
        rate_limit_verify_window_sec=settings.rate_limit_totp_window_sec,
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
    def __init__(self, subject_id: UUID, role: str, extra: dict[str, object]) -> None:
        self.subject_id = subject_id
        self.role = role
        self.extra = extra


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    tokens: Annotated[JoseTokenIssuer, Depends(get_token_issuer)],
) -> CurrentUser:
    if credentials is None:
        raise InvalidToken("Falta el encabezado de autorización.")
    claims = tokens.decodificar(credentials.credentials)
    if claims.get("type") != "access":
        raise InvalidToken()
    subject_id = UUID(str(claims["sub"]))
    role = str(claims["role"])
    extra = {k: v for k, v in claims.items() if k not in {"sub", "role", "type", "iat", "exp"}}
    return CurrentUser(subject_id=subject_id, role=role, extra=extra)


def require_role(*allowed_roles: str):
    async def _dep(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        if user.role not in allowed_roles:
            raise PermissionDenied("Tu tipo de cuenta no tiene acceso a esta operación.")
        return user

    return _dep


async def verify_internal_key(x_internal_key: Annotated[str | None, Header()] = None) -> None:
    settings = get_settings()
    # compare_digest instead of != so the comparison takes the same time
    # regardless of where the strings first differ, a defense-in-depth measure
    # against timing attacks on the shared key.
    if x_internal_key is None or not secrets.compare_digest(x_internal_key, settings.internal_service_key):
        raise UnauthorizedInternalAccess()
