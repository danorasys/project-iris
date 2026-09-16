from __future__ import annotations

from functools import lru_cache
from typing import Annotated

import httpx
from fastapi import Depends

from app.application.proxy_service import ProxyService
from app.config import Settings, get_settings
from app.infrastructure.http_clients.proxy_client import HttpxHttpForwarder


# httpx client shared for the process's whole lifetime, reusing
# connections. Closed explicitly in the lifespan (app/main.py).
@lru_cache
def get_http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient()


def get_http_forwarder(client: Annotated[httpx.AsyncClient, Depends(get_http_client)]) -> HttpxHttpForwarder:
    return HttpxHttpForwarder(client)


def get_proxy_service(
    forwarder: Annotated[HttpxHttpForwarder, Depends(get_http_forwarder)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ProxyService:
    return ProxyService(forwarder=forwarder, timeout_sec=settings.proxy_timeout_sec)
