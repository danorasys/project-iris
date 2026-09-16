# Use case: forward a client request to a domain service.
#
# Applies the routing table (see the comment above each destination_*
# method), strips hop-by-hop headers, propagates X-Correlation-Id and the
# caller's real IP (X-Forwarded-For) explicitly, and blocks any route
# containing the internal segment. Those routes are only for
# service-to-service calls on the private network, never reachable from the
# public gateway.

from __future__ import annotations

from app.correlation import CORRELATION_HEADER, get_correlation_id
from app.domain.exceptions import InternalRouteNotAllowed
from app.domain.ports import HttpForwarder, UpstreamResponse

# Hop-by-hop headers. No point forwarding these as-is, each HTTP leg
# (client->gateway, gateway->service) recalculates them on its own.
# x-forwarded-for is dropped too: it's set below from the connection the
# gateway itself observed, never from whatever a caller sent, otherwise
# anyone could fake it to dodge per-IP rate limits downstream.
_EXCLUDED_OUTGOING_HEADERS = {"host", "content-length", "connection", CORRELATION_HEADER.lower(), "x-forwarded-for"}
_EXCLUDED_INCOMING_HEADERS = {"content-length", "transfer-encoding", "connection"}
FORWARDED_FOR_HEADER = "X-Forwarded-For"

BLOCKED_SEGMENT = "internal"


class ProxyService:
    def __init__(self, forwarder: HttpForwarder, timeout_sec: float) -> None:
        self._forwarder = forwarder
        self._timeout_sec = timeout_sec

    @staticmethod
    def is_blocked(rest: str) -> bool:
        segments = [s for s in rest.split("/") if s]
        return BLOCKED_SEGMENT in segments

    # /api/identity/{rest} -> {IDENTITY_SERVICE_URL}/{rest}. Drops the
    # /api/identity prefix entirely. identity-service exposes /auth,
    # /guardians, /users directly, with no identity prefix.
    @staticmethod
    def destination_identity(base_url: str, rest: str) -> str:
        base = base_url.rstrip("/")
        return f"{base}/{rest}" if rest else base

    # /api/classrooms/{rest} -> {CLASSROOM_SERVICE_URL}/classrooms/{rest}.
    # Drops only /api. classroom-service exposes its routes under
    # /classrooms, that segment stays.
    @staticmethod
    def destination_classrooms(base_url: str, rest: str) -> str:
        base = base_url.rstrip("/")
        return f"{base}/classrooms/{rest}" if rest else f"{base}/classrooms"

    # /api/content/{rest} -> {CONTENT_SERVICE_URL}/{rest}. Drops the
    # /api/content prefix entirely. content-service exposes
    # /classrooms/{id}/lessons and /lessons/{id} directly, with no
    # content prefix.
    @staticmethod
    def destination_content(base_url: str, rest: str) -> str:
        base = base_url.rstrip("/")
        return f"{base}/{rest}" if rest else base

    # /api/notifications/{rest} -> {NOTIFICATION_SERVICE_URL}/notifications/{rest}.
    # Drops only /api. notification-service exposes its routes under
    # /notifications, that segment stays.
    @staticmethod
    def destination_notifications(base_url: str, rest: str) -> str:
        base = base_url.rstrip("/")
        return f"{base}/notifications/{rest}" if rest else f"{base}/notifications"

    async def forward(
        self,
        *,
        method: str,
        destination: str,
        rest: str,
        incoming_headers: dict[str, str],
        params: dict[str, str],
        content: bytes,
        client_ip: str | None = None,
    ) -> UpstreamResponse:
        if self.is_blocked(rest):
            raise InternalRouteNotAllowed()

        headers = {k: v for k, v in incoming_headers.items() if k.lower() not in _EXCLUDED_OUTGOING_HEADERS}
        correlation_id = get_correlation_id()
        if correlation_id:
            headers[CORRELATION_HEADER] = correlation_id
        if client_ip:
            headers[FORWARDED_FOR_HEADER] = client_ip

        response = await self._forwarder.forward(
            method=method,
            url=destination,
            headers=headers,
            params=params,
            content=content,
            timeout_sec=self._timeout_sec,
        )
        outgoing_headers = {
            k: v for k, v in response.headers.items() if k.lower() not in _EXCLUDED_INCOMING_HEADERS
        }
        return UpstreamResponse(status_code=response.status_code, headers=outgoing_headers, content=response.content)
