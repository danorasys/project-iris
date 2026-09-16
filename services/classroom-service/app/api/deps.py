from __future__ import annotations

from functools import lru_cache
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis, from_url

from app.application.classroom_service import ClassroomService
from app.config import Settings, get_settings
from app.domain.exceptions import UnauthorizedInternalAccess, PermissionDenied, InvalidToken
from app.domain.ports import IdentityGateway
from app.infrastructure.http_clients.identity_client import IdentityHttpClient
from app.infrastructure.redis_gateway import RedisEventPublisher, RedisRateLimiter
from app.infrastructure.storage import S3ObjectStorage
from app.infrastructure.uow import SqlAlchemyUnitOfWork

_bearer = HTTPBearer(auto_error=False)


@lru_cache
def get_redis() -> Redis:
    return from_url(get_settings().redis_url, decode_responses=True)


def get_rate_limiter(redis: Annotated[Redis, Depends(get_redis)]) -> RedisRateLimiter:
    return RedisRateLimiter(redis)


def get_event_publisher(redis: Annotated[Redis, Depends(get_redis)]) -> RedisEventPublisher:
    return RedisEventPublisher(redis)


@lru_cache
def get_object_storage() -> S3ObjectStorage:
    settings = get_settings()
    return S3ObjectStorage(
        endpoint_url=settings.s3_endpoint_url,
        access_key=settings.s3_access_key,
        secret_key=settings.s3_secret_key,
        bucket=settings.s3_bucket,
        region=settings.s3_region,
        public_url=settings.s3_public_url,
    )


# One instance per process. The circuit breaker and token cache (TTLCache)
# only make sense if they're shared across requests.
@lru_cache
def get_identity_gateway() -> IdentityHttpClient:
    settings = get_settings()
    return IdentityHttpClient(base_url=settings.identity_service_url, internal_key=settings.internal_service_key)


def get_classroom_service(
    settings: Annotated[Settings, Depends(get_settings)],
    identity: Annotated[IdentityGateway, Depends(get_identity_gateway)],
    storage: Annotated[S3ObjectStorage, Depends(get_object_storage)],
    events: Annotated[RedisEventPublisher, Depends(get_event_publisher)],
    rate_limiter: Annotated[RedisRateLimiter, Depends(get_rate_limiter)],
) -> ClassroomService:
    return ClassroomService(
        uow_factory=SqlAlchemyUnitOfWork,
        identity_gateway=identity,
        storage=storage,
        event_publisher=events,
        rate_limiter=rate_limiter,
        rate_limit_enrollment_max=settings.rate_limit_enrollment_max,
        rate_limit_enrollment_window_sec=settings.rate_limit_enrollment_window_sec,
    )


class CurrentUser:
    def __init__(self, subject_id: UUID, role: str, extra: dict[str, str]) -> None:
        self.subject_id = subject_id
        self.role = role
        self.extra = extra


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    identity: Annotated[IdentityGateway, Depends(get_identity_gateway)],
) -> CurrentUser:
    # Unlike identity-service, classroom-service never sees JWT_SECRET. It
    # validates the token by calling identity-service's
    # /internal/tokens/validate. If identity-service doesn't respond, this
    # raises IdentityServiceUnavailable (503). A missing response is never
    # treated as authenticated.
    if credentials is None:
        raise InvalidToken("Falta el encabezado de autorización.")
    claims = await identity.validar_token(credentials.credentials)
    return CurrentUser(subject_id=claims.sub, role=claims.role, extra=claims.extra)


def require_role(*allowed_roles: str):
    async def _dep(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        if user.role not in allowed_roles:
            raise PermissionDenied("Tu tipo de cuenta no tiene acceso a esta operación.")
        return user

    return _dep


async def verify_internal_key(x_internal_key: Annotated[str | None, Header()] = None) -> None:
    settings = get_settings()
    if x_internal_key != settings.internal_service_key:
        raise UnauthorizedInternalAccess()
