# Domain errors, turned into HTTP in app/errors.py. `code`, `message` and
# `details` follow the error format of every service; the code and the
# message are in Spanish because people read them.

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


class StorageFull(DomainError):
    code = "almacenamiento_lleno"
    message = "Se llenó el espacio para imágenes. Avísale al administrador de IRIS."


# A teacher whose session hasn't passed the 2FA code yet (identity-service
# marks the access token with mfa once it has). Same code in every service,
# so the web app knows to ask for it.
class UnauthorizedInternalAccess(DomainError):
    code = "acceso_interno_no_autorizado"
    message = "Esta operación solo puede ser invocada por otros servicios de IRIS."


class TwoFactorRequired(DomainError):
    code = "verificacion_2fa_requerida"
    message = "Confirma tu identidad con el código de verificación para entrar a tu panel docente."


class UnitNotEmpty(DomainError):
    # A unit with lessons can't go, so a click never deletes a lot of work.
    code = "unidad_con_lecciones"
    message = "Mueve o elimina primero las lecciones de esta unidad."


class InvalidOrder(DomainError):
    # A new order must name every unit (or lesson) exactly once.
    code = "orden_invalido"
    message = "El nuevo orden no coincide con los elementos actuales."


class LessonIncomplete(DomainError):
    # Publishing (or saving a published lesson) needs everything in place.
    # details["missing"] lists what's left, in words the teacher reads.
    code = "leccion_incompleta"
    message = "A la lección todavía le faltan cosas para publicarla."


class InvalidAudience(DomainError):
    # An extra can only be for kids that are members of the class.
    code = "estudiantes_no_validos"
    message = "Elige estudiantes que sean miembros de la clase."
