# Domain errors. Translated to HTTP in app/errors.py. The domain layer
# doesn't know about HTTP status codes, only business semantics.
#
# `code`, `message` and `details` are the keys/attributes of the shared HTTP
# error envelope, {"error": {"code", "message", "details"}}, the same contract
# used across all 5 services. The `code` and `message` VALUES are kept in
# Spanish since they're user-facing content, not Python identifiers.

from __future__ import annotations


class DomainError(Exception):
    code = "error_dominio"
    message = "Ocurrió un error inesperado."

    def __init__(self, message: str | None = None, **details: object) -> None:
        super().__init__(message or self.message)
        if message:
            self.message = message
        self.details = details or None


class InvalidToken(DomainError):
    code = "token_invalido"
    message = "El token es inválido o expiró."


class IdentityServiceUnavailable(DomainError):
    # identity-service didn't respond in time, circuit breaker open or timeout.
    # Fail-closed to "not verified", never treated as authenticated.
    code = "autenticacion_no_disponible"
    message = "No se pudo confirmar tu identidad en este momento. Intenta de nuevo en unos segundos."


class PermissionDenied(DomainError):
    # Used both for the local check (teacher isn't the author, role not
    # allowed) and for the fail-closed fallback when classroom-service is down.
    code = "permiso_denegado"
    message = "No tienes permiso para realizar esta acción."


class ResourceNotFound(DomainError):
    code = "recurso_no_encontrado"
    message = "El recurso solicitado no existe."


class InvalidFile(DomainError):
    code = "archivo_invalido"
    message = "El archivo enviado no es válido."
