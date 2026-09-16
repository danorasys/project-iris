# Domain errors. Translated to HTTP in app/errors.py. The domain layer
# doesn't know about HTTP status codes, only business semantics.

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
    code = "identity_service_no_disponible"
    message = "No fue posible confirmar tu identidad en este momento."


class NotificationNotFound(DomainError):
    code = "notificacion_no_encontrada"
    message = "La notificación no existe."


class PermissionDenied(DomainError):
    code = "acceso_denegado"
    message = "No tienes permiso para esta operación."
