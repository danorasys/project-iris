# Per IP request limit at the gateway. Two budgets: a general one and a
# tighter one for the login area. It is a first wall against floods and
# guessing from one address, the per account locks live in identity-service.
# The counting itself is done by a RequestCounter (Redis), see app/main.py.

from __future__ import annotations

import hashlib

from fastapi import status
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

AUTH_PATH_PREFIX = "/api/identity/auth/"
EXEMPT_PATH_PREFIX = "/health/"


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, general_max: int, auth_max: int, window_sec: int) -> None:
        super().__init__(app)
        self._general_max = general_max
        self._auth_max = auth_max
        self._window_sec = window_sec

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        if path.startswith(EXEMPT_PATH_PREFIX) or request.method == "OPTIONS":
            return await call_next(request)

        # Only a hash of the IP goes into the key, Redis never holds it as text.
        ip = request.client.host if request.client else "unknown"
        scope = "auth" if path.startswith(AUTH_PATH_PREFIX) else "general"
        limit = self._auth_max if scope == "auth" else self._general_max
        key = f"{scope}:{hashlib.sha256(ip.encode('utf-8')).hexdigest()[:32]}"

        wait = await request.app.state.request_counter.hit(key, limit, self._window_sec)
        if wait:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(wait)},
                content={
                    "error": {
                        "code": "demasiadas_solicitudes",
                        "message": "Hiciste demasiadas solicitudes seguidas. Espera un momento e intenta de nuevo.",
                        "details": {"retry_after_seconds": wait},
                    }
                },
            )
        return await call_next(request)
