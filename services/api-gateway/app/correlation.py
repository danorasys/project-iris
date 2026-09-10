"""X-Correlation-Id middleware.

Generated here, at the API Gateway, if the client didn't send one. Each
service propagates the same value in its response and exposes it through a
ContextVar, so the logger and outgoing HTTP clients can include it without
passing it manually through every layer. The gateway also adds it explicitly
as a header on every request it forwards to domain services (see
app/application/proxy_service.py), so end-to-end tracing works even when a
request crosses multiple services.
"""

from __future__ import annotations

import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

CORRELATION_HEADER = "X-Correlation-Id"
_correlation_id: ContextVar[str | None] = ContextVar("correlation_id", default=None)


def get_correlation_id() -> str | None:
    return _correlation_id.get()


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        correlation_id = request.headers.get(CORRELATION_HEADER) or str(uuid.uuid4())
        token = _correlation_id.set(correlation_id)
        try:
            response = await call_next(request)
        finally:
            _correlation_id.reset(token)
        response.headers[CORRELATION_HEADER] = correlation_id
        return response
