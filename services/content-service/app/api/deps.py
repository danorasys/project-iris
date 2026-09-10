from __future__ import annotations

from functools import lru_cache
from typing import Annotated

import httpx
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis, from_url

from app.application.lesson_service import LessonService
from app.config import Settings, get_settings
from app.correlation import get_correlation_id
from app.domain.entities import ValidatedUser
from app.domain.exceptions import PermissionDenied, InvalidToken
from app.infrastructure.http_clients.circuit_breaker import CircuitBreaker
from app.infrastructure.http_clients.classroom_client import HttpClassroomClient
from app.infrastructure.http_clients.identity_client import HttpIdentityClient
from app.infrastructure.storage import S3ObjectStorage
from app.infrastructure.uow import SqlAlchemyUnitOfWork

_bearer = HTTPBearer(auto_error=False)


@lru_cache
def get_http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=httpx.Timeout(2.0))


@lru_cache
def get_redis() -> Redis:
    return from_url(get_settings().redis_url, decode_responses=True)


@lru_cache
def get_identity_client() -> HttpIdentityClient:
    settings = get_settings()
    return HttpIdentityClient(
        http_client=get_http_client(),
        base_url=settings.identity_service_url,
        internal_key=settings.internal_service_key,
        breaker=CircuitBreaker(
            failure_threshold=settings.circuit_breaker_failure_threshold,
            recovery_seconds=settings.circuit_breaker_recovery_seconds,
        ),
        cache_ttl_seconds=settings.auth_cache_ttl_seconds,
    )


@lru_cache
def get_classroom_client() -> HttpClassroomClient:
    settings = get_settings()
    return HttpClassroomClient(
        http_client=get_http_client(),
        base_url=settings.classroom_service_url,
        internal_key=settings.internal_service_key,
        breaker=CircuitBreaker(
            failure_threshold=settings.circuit_breaker_failure_threshold,
            recovery_seconds=settings.circuit_breaker_recovery_seconds,
        ),
        cache_ttl_seconds=settings.auth_cache_ttl_seconds,
    )


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


def get_lesson_service(
    settings: Annotated[Settings, Depends(get_settings)],
    classroom: Annotated[HttpClassroomClient, Depends(get_classroom_client)],
    storage: Annotated[S3ObjectStorage, Depends(get_object_storage)],
) -> LessonService:
    return LessonService(
        uow_factory=SqlAlchemyUnitOfWork,
        classroom_client=classroom,
        object_storage=storage,
        max_image_bytes=settings.max_image_bytes,
    )


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    identity: Annotated[HttpIdentityClient, Depends(get_identity_client)],
) -> ValidatedUser:
    if credentials is None:
        raise InvalidToken("Falta el encabezado de autorización.")
    return await identity.validate_token(credentials.credentials, get_correlation_id())


def require_role(*allowed_roles: str):
    async def _dep(user: Annotated[ValidatedUser, Depends(get_current_user)]) -> ValidatedUser:
        if user.role not in allowed_roles:
            raise PermissionDenied("Tu tipo de cuenta no tiene acceso a esta operación.")
        return user

    return _dep
