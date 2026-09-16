# Concrete httpx implementation of the HttpForwarder port.
#
# Distinguishes between failing to connect (connection refused, connect
# timeout), which the caller maps to 502, and connecting but not getting a
# response in time, which maps to 504.

from __future__ import annotations

import httpx

from app.domain.exceptions import UpstreamTimeout, UpstreamUnavailable
from app.domain.ports import UpstreamResponse


class HttpxHttpForwarder:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def forward(
        self,
        *,
        method: str,
        url: str,
        headers: dict[str, str],
        params: dict[str, str],
        content: bytes,
        timeout_sec: float,
    ) -> UpstreamResponse:
        try:
            response = await self._client.request(
                method,
                url,
                headers=headers,
                params=params,
                content=content,
                timeout=httpx.Timeout(timeout_sec),
            )
        except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
            raise UpstreamUnavailable() from exc
        except (httpx.ReadTimeout, httpx.WriteTimeout, httpx.PoolTimeout) as exc:
            raise UpstreamTimeout() from exc
        except httpx.HTTPError as exc:
            raise UpstreamUnavailable() from exc

        return UpstreamResponse(
            status_code=response.status_code,
            headers=dict(response.headers),
            content=response.content,
        )
