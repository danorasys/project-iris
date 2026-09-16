# Domain errors. Translated to HTTP in app/errors.py, the domain doesn't
# know about HTTP status codes, only business semantics.

from __future__ import annotations


class DomainError(Exception):
    code = "error_dominio"
    message = "Ocurrió un error inesperado."

    def __init__(self, message: str | None = None, **details: object) -> None:
        super().__init__(message or self.message)
        if message:
            self.message = message
        self.details = details or None


class ClassroomNotFound(DomainError):
    code = "aula_no_encontrada"
    message = "El aula solicitada no existe."


class ResourceNotFound(DomainError):
    code = "recurso_no_encontrado"
    message = "El recurso solicitado no existe."


class EnrollmentNotFound(DomainError):
    code = "inscripcion_no_encontrada"
    message = "La solicitud de ingreso no existe."


class InvalidEnrollmentCode(DomainError):
    code = "codigo_ingreso_invalido"
    message = "El código de ingreso no corresponde a ningún aula."


class AlreadyEnrolledOrPending(DomainError):
    code = "ya_inscrito_o_pendiente"
    message = "Ya existe una inscripción pendiente o aceptada para esta aula."


class RequestAlreadyResolved(DomainError):
    code = "solicitud_ya_resuelta"
    message = "Esta solicitud de ingreso ya fue resuelta."


class PermissionDenied(DomainError):
    code = "permiso_denegado"
    message = "No tienes permiso para realizar esta acción."


class AttemptLimitExceeded(DomainError):
    code = "limite_intentos_excedido"
    message = "Demasiados intentos. Intenta de nuevo más tarde."


class InvalidToken(DomainError):
    code = "token_invalido"
    message = "El token es inválido o expiró."


class IdentityServiceUnavailable(DomainError):
    code = "identidad_no_disponible"
    message = "No fue posible confirmar tu identidad en este momento. Intenta de nuevo."


class InvalidFile(DomainError):
    code = "archivo_invalido"
    message = "El archivo enviado no es válido."


class UnauthorizedInternalAccess(DomainError):
    code = "acceso_interno_no_autorizado"
    message = "Esta operación solo puede ser invocada por otros servicios de IRIS."
