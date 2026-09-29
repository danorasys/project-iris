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
    ConsentRequired,
    DocumentNumberAlreadyRegistered,
    EmailAlreadyRegistered,
    InvalidAvatar,
    InvalidCredentials,
    InvalidDocumentNumberFormat,
    InvalidDocumentType,
    InvalidRelationshipType,
    InvalidSupportCondition,
    InvalidTotpCode,
    DomainError,
    AttemptLimitExceeded,
    PermissionDenied,
    InvalidPin,
    ResourceNotFound,
    InvalidToken,
    PortalAccessRequired,
    SessionClosedForSecurity,
    TotpNotEnabled,
    TotpSetupNotStarted,
)

logger = logging.getLogger(__name__)

_STATUS_POR_ERROR: dict[type[DomainError], int] = {
    EmailAlreadyRegistered: status.HTTP_409_CONFLICT,
    DocumentNumberAlreadyRegistered: status.HTTP_409_CONFLICT,
    InvalidCredentials: status.HTTP_401_UNAUTHORIZED,
    InvalidPin: status.HTTP_401_UNAUTHORIZED,
    InvalidToken: status.HTTP_401_UNAUTHORIZED,
    AttemptLimitExceeded: status.HTTP_429_TOO_MANY_REQUESTS,
    ResourceNotFound: status.HTTP_404_NOT_FOUND,
    PermissionDenied: status.HTTP_403_FORBIDDEN,
    ConsentRequired: status.HTTP_422_UNPROCESSABLE_CONTENT,
    InvalidDocumentType: status.HTTP_422_UNPROCESSABLE_CONTENT,
    InvalidDocumentNumberFormat: status.HTTP_422_UNPROCESSABLE_CONTENT,
    InvalidRelationshipType: status.HTTP_422_UNPROCESSABLE_CONTENT,
    InvalidSupportCondition: status.HTTP_422_UNPROCESSABLE_CONTENT,
    InvalidAvatar: status.HTTP_422_UNPROCESSABLE_CONTENT,
    UnauthorizedInternalAccess: status.HTTP_401_UNAUTHORIZED,
    InvalidTotpCode: status.HTTP_401_UNAUTHORIZED,
    PortalAccessRequired: status.HTTP_403_FORBIDDEN,
    SessionClosedForSecurity: status.HTTP_401_UNAUTHORIZED,
    TotpNotEnabled: status.HTTP_409_CONFLICT,
    TotpSetupNotStarted: status.HTTP_422_UNPROCESSABLE_CONTENT,
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
        headers = None
        retry_after = (exc.details or {}).get("retry_after_seconds")
        if retry_after is not None:
            headers = {"Retry-After": str(retry_after)}
        return JSONResponse(
            status_code=status_code, content=_envelope(exc.code, exc.message, exc.details), headers=headers
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # jsonable_encoder can't serialize the exceptions Pydantic v2 leaves in "ctx"
        # for debugging. We stringify them instead of dropping them, so we don't lose
        # which validation rule actually failed.
        #
        # "input" is dropped on purpose: Pydantic fills it with the exact value that
        # was submitted, and this service validates fields like password and pin.
        # Echoing that value back in the response would leak it into browser devtools,
        # proxies or logs that capture response bodies.
        errores_serializables = []
        for e in exc.errors():
            error = {k: v for k, v in e.items() if k != "input"}
            if error.get("ctx"):
                error["ctx"] = {k: str(v) for k, v in error["ctx"].items()}
            errores_serializables.append(error)
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
