# Translates domain and validation errors into a uniform HTTP envelope,
# {"error": {"code", "message", "details"}}. Same contract across all 5 services.

from __future__ import annotations

import logging

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.domain.exceptions import (
    DomainError,
    IdentityServiceUnavailable,
    InvalidToken,
    NotificationNotFound,
    PermissionDenied,
)

logger = logging.getLogger(__name__)

_STATUS_BY_ERROR: dict[type[DomainError], int] = {
    InvalidToken: status.HTTP_401_UNAUTHORIZED,
    IdentityServiceUnavailable: status.HTTP_503_SERVICE_UNAVAILABLE,
    NotificationNotFound: status.HTTP_404_NOT_FOUND,
    PermissionDenied: status.HTTP_403_FORBIDDEN,
}


def _envelope(code: str, message: str, details: dict[str, object] | None = None) -> dict[str, object]:
    body: dict[str, object] = {"code": code, "message": message}
    if details:
        body["details"] = details
    return {"error": body}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def handle_domain_error(_: Request, exc: DomainError) -> JSONResponse:
        status_code = _STATUS_BY_ERROR.get(type(exc), status.HTTP_400_BAD_REQUEST)
        return JSONResponse(status_code=status_code, content=_envelope(exc.code, exc.message, exc.details))

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        errores_serializables = [
            {**e, "ctx": {k: str(v) for k, v in e["ctx"].items()}} if e.get("ctx") else e for e in exc.errors()
        ]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_envelope(
                "datos_invalidos", "Los datos enviados no son válidos.", {"errores": jsonable_encoder(errores_serializables)}
            ),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Error no controlado")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_envelope("error_interno", "Ocurrió un error inesperado. Intenta de nuevo más tarde."),
        )
