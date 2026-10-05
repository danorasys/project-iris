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


# Same code identity-service uses, so the web app asks for the 2FA code
# in the same way, whichever service answered.
class PortalAccessRequired(DomainError):
    code = "acceso_portal_requerido"
    message = "Confirma tu código de verificación para entrar al portal de padres."


class PermissionDenied(DomainError):
    code = "acceso_denegado"
    message = "No tienes permiso para esta operación."


# A teacher whose session hasn't passed the 2FA code yet (identity-service
# marks the access token with mfa once it has). Same code in every service,
# so the web app knows to ask for it.
class TwoFactorRequired(DomainError):
    code = "verificacion_2fa_requerida"
    message = "Confirma tu identidad con el código de verificación para entrar a tu panel docente."
