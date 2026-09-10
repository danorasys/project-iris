"""BFF routing table:

| Incoming prefix        | Target service            | Path transform                                             |
|-------------------------|----------------------------|--------------------------------------------------------------|
| /api/identity/{r}      | IDENTITY_SERVICE_URL      | {IDENTITY_SERVICE_URL}/{r}, drops /api/identity              |
| /api/classrooms/{r}    | CLASSROOM_SERVICE_URL     | {CLASSROOM_SERVICE_URL}/classrooms/{r}, drops only /api      |
| /api/content/{r}       | CONTENT_SERVICE_URL       | {CONTENT_SERVICE_URL}/{r}, drops /api/content                |
| /api/notifications/{r} | NOTIFICATION_SERVICE_URL  | {NOTIFICATION_SERVICE_URL}/notifications/{r}, drops only /api |

Each prefix is registered twice, with and without {rest}, so both
/api/classrooms and /api/classrooms/123/solicitudes route correctly."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from app.api.deps import get_proxy_service
from app.application.proxy_service import ProxyService
from app.config import Settings, get_settings

router = APIRouter(tags=["gateway"])

_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]

PREFIX_IDENTITY = "/api/identity"
PREFIX_CLASSROOMS = "/api/classrooms"
PREFIX_CONTENT = "/api/content"
PREFIX_NOTIFICATIONS = "/api/notifications"


async def _execute_forward(request: Request, rest: str, destination: str, proxy: ProxyService) -> Response:
    body = await request.body()
    result = await proxy.forward(
        method=request.method,
        destination=destination,
        rest=rest,
        incoming_headers=dict(request.headers),
        params=dict(request.query_params),
        content=body,
        client_ip=request.client.host if request.client else None,
    )
    return Response(content=result.content, status_code=result.status_code, headers=result.headers)


@router.api_route(PREFIX_IDENTITY + "/{rest:path}", methods=_METHODS)
@router.api_route(PREFIX_IDENTITY, methods=_METHODS)
async def proxy_identity(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    proxy: Annotated[ProxyService, Depends(get_proxy_service)],
    rest: str = "",
) -> Response:
    destination = ProxyService.destination_identity(settings.identity_service_url, rest)
    return await _execute_forward(request, rest, destination, proxy)


@router.api_route(PREFIX_CLASSROOMS + "/{rest:path}", methods=_METHODS)
@router.api_route(PREFIX_CLASSROOMS, methods=_METHODS)
async def proxy_classrooms(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    proxy: Annotated[ProxyService, Depends(get_proxy_service)],
    rest: str = "",
) -> Response:
    destination = ProxyService.destination_classrooms(settings.classroom_service_url, rest)
    return await _execute_forward(request, rest, destination, proxy)


@router.api_route(PREFIX_CONTENT + "/{rest:path}", methods=_METHODS)
@router.api_route(PREFIX_CONTENT, methods=_METHODS)
async def proxy_content(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    proxy: Annotated[ProxyService, Depends(get_proxy_service)],
    rest: str = "",
) -> Response:
    destination = ProxyService.destination_content(settings.content_service_url, rest)
    return await _execute_forward(request, rest, destination, proxy)


@router.api_route(PREFIX_NOTIFICATIONS + "/{rest:path}", methods=_METHODS)
@router.api_route(PREFIX_NOTIFICATIONS, methods=_METHODS)
async def proxy_notifications(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    proxy: Annotated[ProxyService, Depends(get_proxy_service)],
    rest: str = "",
) -> Response:
    destination = ProxyService.destination_notifications(settings.notification_service_url, rest)
    return await _execute_forward(request, rest, destination, proxy)
