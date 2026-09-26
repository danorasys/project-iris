# Translates domain and validation errors into a uniform HTTP envelope,
# {"error": {"code", "message", "details"}}. Same contract across all 5 services.

from __future__ import annotations

import logging

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.domain.exceptions import (
    UnauthorizedInternalAccess,
    InvalidFile,
    ClassroomNotFound,
    InvalidEnrollmentCode,
    DomainError,
    IdentityServiceUnavailable,
    EnrollmentNotFound,
    AttemptLimitExceeded,
    PermissionDenied,
    ResourceNotFound,
    RequestAlreadyResolved,
    InvalidToken,
    AlreadyEnrolledOrPending,
)

logger = logging.getLogger(__name__)

_STATUS_POR_ERROR: dict[type[DomainError], int] = {
    ClassroomNotFound: status.HTTP_404_NOT_FOUND,
    ResourceNotFound: status.HTTP_404_NOT_FOUND,
    EnrollmentNotFound: status.HTTP_404_NOT_FOUND,
    InvalidEnrollmentCode: status.HTTP_404_NOT_FOUND,
    AlreadyEnrolledOrPending: status.HTTP_409_CONFLICT,
    RequestAlreadyResolved: status.HTTP_409_CONFLICT,
    PermissionDenied: status.HTTP_403_FORBIDDEN,
    AttemptLimitExceeded: status.HTTP_429_TOO_MANY_REQUESTS,
    InvalidToken: status.HTTP_401_UNAUTHORIZED,
    IdentityServiceUnavailable: status.HTTP_503_SERVICE_UNAVAILABLE,
    InvalidFile: status.HTTP_422_UNPROCESSABLE_CONTENT,
    UnauthorizedInternalAccess: status.HTTP_401_UNAUTHORIZED,
}


def _envelope(code: str, message: str, details: dict[str, object] | None = None) -> dict[str, object]:
    body: dict[str, object] = {"code": code, "message": message}
    if details:
        body["details"] = details
    return {"error": body}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def handle_domain_error(_: Request, exc: DomainError) -> JSONResponse:
        status_code = _STATUS_POR_ERROR.get(type(exc), status.HTTP_400_BAD_REQUEST)
        return JSONResponse(status_code=status_code, content=_envelope(exc.code, exc.message, exc.details))

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # jsonable_encoder can't serialize the exceptions Pydantic v2 leaves in "ctx"
        # for debugging. We stringify them instead of dropping them, so we don't lose
        # which validation rule actually failed.
        errores_serializables = [
            {**e, "ctx": {k: str(v) for k, v in e["ctx"].items()}} if e.get("ctx") else e for e in exc.errors()
        ]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
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
