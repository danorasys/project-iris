# Protocol that decouples application/ from the concrete HTTP client (httpx,
# in infrastructure/http_clients/proxy_client.py). The application layer
# never imports httpx directly, only this abstract shape.

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class UpstreamResponse:
    status_code: int
    headers: dict[str, str]
    content: bytes


class HttpForwarder(Protocol):
    async def forward(
        self,
        *,
        method: str,
        url: str,
        headers: dict[str, str],
        params: dict[str, str],
        content: bytes,
        timeout_sec: float,
    ) -> UpstreamResponse: ...
