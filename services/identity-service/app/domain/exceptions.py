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


class EmailAlreadyRegistered(DomainError):
    code = "correo_ya_registrado"
    message = "Ya existe una cuenta registrada con este correo."


class DocumentNumberAlreadyRegistered(DomainError):
    code = "documento_ya_registrado"
    message = "Ya existe una cuenta registrada con este número de documento."


class InvalidDocumentType(DomainError):
    code = "tipo_documento_invalido"
    message = "El tipo de documento indicado no existe."


class InvalidDocumentNumberFormat(DomainError):
    code = "formato_documento_invalido"
    message = "El número de documento no tiene un formato válido."


class InvalidRelationshipType(DomainError):
    code = "tipo_relacion_invalido"
    message = "El tipo de relación indicado no existe."


class InvalidSupportCondition(DomainError):
    code = "condicion_apoyo_invalida"
    message = "La condición indicada no existe."


class InvalidAvatar(DomainError):
    code = "avatar_invalido"
    message = "El avatar indicado no existe."


class InvalidCredentials(DomainError):
    code = "credenciales_invalidas"
    message = "Correo o contraseña incorrectos."


class InvalidPin(DomainError):
    code = "pin_invalido"
    message = "El PIN ingresado no es correcto."


class AttemptLimitExceeded(DomainError):
    code = "limite_intentos_excedido"
    message = "Demasiados intentos. Intenta de nuevo más tarde."


class InvalidToken(DomainError):
    code = "token_invalido"
    message = "El token es inválido o expiró."


class ResourceNotFound(DomainError):
    code = "recurso_no_encontrado"
    message = "El recurso solicitado no existe."


class PermissionDenied(DomainError):
    code = "permiso_denegado"
    message = "No tienes permiso para realizar esta acción."


class ConsentRequired(DomainError):
    code = "consentimiento_requerido"
    message = "Se requiere el consentimiento del tutor para continuar."


class UnauthorizedInternalAccess(DomainError):
    code = "acceso_interno_no_autorizado"
    message = "Esta operación solo puede ser invocada por otros servicios de IRIS."


class InvalidTotpCode(DomainError):
    code = "codigo_totp_invalido"
    message = "El código ingresado no es correcto o ya expiró."


class SessionClosedForSecurity(DomainError):
    code = "sesion_cerrada_por_seguridad"
    message = "Cerramos tu sesión por seguridad, hubo demasiados intentos fallidos. Inicia sesión de nuevo."


class PortalAccessRequired(DomainError):
    code = "acceso_portal_requerido"
    message = "Confirma tu identidad con el código de verificación para entrar al Portal Padres."


class TotpNotEnabled(DomainError):
    code = "totp_no_activado"
    message = "Tu cuenta todavía no tiene la verificación en dos pasos activada."


class TotpSetupNotStarted(DomainError):
    code = "configuracion_totp_no_iniciada"
    message = "Primero debes generar el código QR antes de verificar un código."
