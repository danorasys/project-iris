# The refresh token lives in a cookie the page's JavaScript can't read
# (HttpOnly), so an injected script can't steal it. SameSite=Strict keeps
# other sites from sending it, and the path keeps it on the /auth routes.

from __future__ import annotations

from fastapi import Request, Response

from app.config import get_settings
from app.domain.exceptions import MissingClientHeader

# Only the web app sends this header. A page on another site can't add it to
# a request without CORS asking first, and CORS only allows WEB_ORIGIN.
CLIENT_HEADER = "X-Iris-Client"
CLIENT_HEADER_VALUE = "web"


def set_refresh_cookie(response: Response, refresh_token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=refresh_token,
        max_age=settings.jwt_refresh_ttl_days * 24 * 3600,
        path=settings.refresh_cookie_path,
        secure=settings.refresh_cookie_secure,
        httponly=True,
        samesite="strict",
    )


def clear_refresh_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path=settings.refresh_cookie_path,
        secure=settings.refresh_cookie_secure,
        httponly=True,
        samesite="strict",
    )


def read_refresh_cookie(request: Request) -> str | None:
    return request.cookies.get(get_settings().refresh_cookie_name)


async def require_client_header(request: Request) -> None:
    if request.headers.get(CLIENT_HEADER) != CLIENT_HEADER_VALUE:
        raise MissingClientHeader()
