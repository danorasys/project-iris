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
    ErasureUnavailable,
    MissingClientHeader,
    ConsentRequired,
    DocumentNumberAlreadyRegistered,
    EmailAlreadyRegistered,
    InvalidAvatar,
    InvalidCredentials,
    InvalidDocumentNumberFormat,
    InvalidDocumentType,
    BirthDateAfterDocumentIssued,
    WrongCurrentPassword,
    PasswordSameAsCurrent,
    WrongCurrentPin,
    PinSameAsCurrent,
    InvalidRelationshipType,
    InvalidSupportCondition,
    InvalidTotpCode,
    DomainError,
    AttemptLimitExceeded,
    PermissionDenied,
    InvalidPin,
    ResourceNotFound,
    InvalidToken,
    RefreshTokenJustUsed,
    PortalAccessRequired,
    SessionClosedForSecurity,
    TotpAlreadyEnabled,
    TotpNotEnabled,
    TwoFactorRequired,
    TotpSetupNotStarted,
)

logger = logging.getLogger(__name__)

_STATUS_POR_ERROR: dict[type[DomainError], int] = {
    EmailAlreadyRegistered: status.HTTP_409_CONFLICT,
    DocumentNumberAlreadyRegistered: status.HTTP_409_CONFLICT,
    InvalidCredentials: status.HTTP_401_UNAUTHORIZED,
    InvalidPin: status.HTTP_401_UNAUTHORIZED,
    InvalidToken: status.HTTP_401_UNAUTHORIZED,
    RefreshTokenJustUsed: status.HTTP_401_UNAUTHORIZED,
    AttemptLimitExceeded: status.HTTP_429_TOO_MANY_REQUESTS,
    ResourceNotFound: status.HTTP_404_NOT_FOUND,
    ErasureUnavailable: status.HTTP_503_SERVICE_UNAVAILABLE,
    PermissionDenied: status.HTTP_403_FORBIDDEN,
    ConsentRequired: status.HTTP_422_UNPROCESSABLE_CONTENT,
    InvalidDocumentType: status.HTTP_422_UNPROCESSABLE_CONTENT,
    InvalidDocumentNumberFormat: status.HTTP_422_UNPROCESSABLE_CONTENT,
    InvalidRelationshipType: status.HTTP_422_UNPROCESSABLE_CONTENT,
    BirthDateAfterDocumentIssued: status.HTTP_422_UNPROCESSABLE_CONTENT,
    # Not 401: that one means "your session ended" and the web app would sign out.
    WrongCurrentPassword: status.HTTP_422_UNPROCESSABLE_CONTENT,
    PasswordSameAsCurrent: status.HTTP_422_UNPROCESSABLE_CONTENT,
    WrongCurrentPin: status.HTTP_422_UNPROCESSABLE_CONTENT,
    PinSameAsCurrent: status.HTTP_422_UNPROCESSABLE_CONTENT,
    InvalidSupportCondition: status.HTTP_422_UNPROCESSABLE_CONTENT,
    InvalidAvatar: status.HTTP_422_UNPROCESSABLE_CONTENT,
    UnauthorizedInternalAccess: status.HTTP_401_UNAUTHORIZED,
    InvalidTotpCode: status.HTTP_401_UNAUTHORIZED,
    PortalAccessRequired: status.HTTP_403_FORBIDDEN,
    MissingClientHeader: status.HTTP_403_FORBIDDEN,
    SessionClosedForSecurity: status.HTTP_401_UNAUTHORIZED,
    TotpAlreadyEnabled: status.HTTP_409_CONFLICT,
    TotpNotEnabled: status.HTTP_409_CONFLICT,
    TwoFactorRequired: status.HTTP_403_FORBIDDEN,
    TotpSetupNotStarted: status.HTTP_422_UNPROCESSABLE_CONTENT,
}


def _envelope(code: str, message: str, details: dict[str, object] | None = None) -> dict[str, object]:
    body: dict[str, object] = {"code": code, "message": message}
    if details:
        body["details"] = details
    return {"error": body}


# The same answer the handler below gives, for a route that has to add
# something to it (like deleting the session cookie).
def domain_error_response(exc: DomainError) -> JSONResponse:
    status_code = _STATUS_POR_ERROR.get(type(exc), status.HTTP_400_BAD_REQUEST)
    headers = None
    retry_after = (exc.details or {}).get("retry_after_seconds")
    if retry_after is not None:
        headers = {"Retry-After": str(retry_after)}
    return JSONResponse(status_code=status_code, content=_envelope(exc.code, exc.message, exc.details), headers=headers)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def handle_domain_error(_: Request, exc: DomainError) -> JSONResponse:
        return domain_error_response(exc)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Pydantic leaves exceptions in "ctx" that JSON can't hold, so they become
        # text (we still want to know which rule failed). "input" is dropped on
        # purpose: it's the exact value sent, and that can be a password or a PIN.
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
