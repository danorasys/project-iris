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
    message = "Ese código no corresponde a ninguna clase de IRIS. Revísalo con el docente."


class AlreadyEnrolledOrPending(DomainError):
    code = "ya_inscrito_o_pendiente"
    message = "Ya existe una inscripción pendiente o aceptada para esta aula."


# The kid isn't one of the guardian's. Same 404 as a kid that doesn't exist.
class KidNotInFamily(DomainError):
    code = "peque_no_encontrado"
    message = "Ese peque no está en tu cuenta."


# Only a kid already in the class can write to its teacher (HU-48).
class NotInClassroomYet(DomainError):
    code = "aun_no_esta_en_la_clase"
    message = "Tu peque todavía no está en esta clase."


# content-service didn't answer with the kid's progress.
class ClassroomWithoutTeacher(DomainError):
    code = "clase_sin_docente"
    message = "Esta clase ya no tiene un docente a cargo, así que no recibe solicitudes ni cambios."


class StatisticsUnavailable(DomainError):
    code = "estadisticas_no_disponibles"
    message = "No pudimos cargar las estadísticas en este momento. Intenta de nuevo."


class ProgressUnavailable(DomainError):
    code = "progreso_no_disponible"
    message = "No pudimos cargar el progreso en este momento. Intenta de nuevo."


# The message to the teacher couldn't leave (Redis didn't answer).
class MessageNotSent(DomainError):
    code = "mensaje_no_enviado"
    message = "No pudimos enviar tu mensaje en este momento. Intenta de nuevo."


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


class IncompleteClassroom(DomainError):
    code = "clase_incompleta"
    message = "Elige el área y el grado de la clase."


class MissingOtherArea(DomainError):
    code = "otra_area_requerida"
    message = "Escribe cuál es el área de la clase."


class StorageFull(DomainError):
    code = "almacenamiento_lleno"
    message = "Se llenó el espacio para imágenes. Avísale al administrador de IRIS."


class ContentServiceUnavailable(DomainError):
    code = "contenido_no_disponible"
    message = "No fue posible borrar las lecciones de la clase en este momento. Intenta de nuevo."


class UnauthorizedInternalAccess(DomainError):
    code = "acceso_interno_no_autorizado"
    message = "Esta operación solo puede ser invocada por otros servicios de IRIS."


# A guardian whose session doesn't have the parents' portal open: the
# classes of their kids need the portal's 2FA code. Same code in every
# service, so the web app asks for it and tries again.
class PortalAccessRequired(DomainError):
    code = "acceso_portal_requerido"
    message = "Confirma tu código de verificación para entrar al portal de padres."


# A teacher whose session hasn't passed the 2FA code yet (identity-service
# marks the access token with mfa once it has). Same code in every service,
# so the web app knows to ask for it.
class TwoFactorRequired(DomainError):
    code = "verificacion_2fa_requerida"
    message = "Confirma tu identidad con el código de verificación para entrar a tu panel docente."
