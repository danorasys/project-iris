# Protocols that decouple the rest of the app from the concrete tools: the HTTP
# client (httpx, in infrastructure/http_clients/proxy_client.py) and the request
# counter (Redis, in infrastructure/redis_rate_limiter.py). Nothing outside
# infrastructure/ imports those tools directly, only these abstract shapes.

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


class RequestCounter(Protocol):
    # Counts one request for key inside a window of window_sec seconds.
    # Returns 0 if it is allowed, or the seconds left until the window ends
    # if the limit was already reached.
    async def hit(self, key: str, limit: int, window_sec: int) -> int: ...
