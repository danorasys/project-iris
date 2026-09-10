from __future__ import annotations

import asyncio
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, Response, status

from app.api.deps import get_http_client
from app.config import Settings, get_settings

router = APIRouter(tags=["health"])


@router.get("/health/live")
async def live() -> dict[str, str]:
    return {"status": "ok"}


async def _service_available(client: httpx.AsyncClient, base_url: str, timeout_sec: float) -> bool:
    try:
        response = await client.get(f"{base_url.rstrip('/')}/health/live", timeout=httpx.Timeout(timeout_sec))
    except httpx.HTTPError:
        return False
    return response.status_code == status.HTTP_200_OK


@router.get("/health/ready")
async def ready(
    response: Response,
    client: Annotated[httpx.AsyncClient, Depends(get_http_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, str]:
    urls = (
        settings.identity_service_url,
        settings.classroom_service_url,
        settings.content_service_url,
        settings.notification_service_url,
    )
    results = await asyncio.gather(
        *(_service_available(client, url, settings.health_check_timeout_sec) for url in urls)
    )
    if not all(results):
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "unavailable"}
    return {"status": "ok"}
