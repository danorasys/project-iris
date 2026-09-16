# Domain errors that belong to the gateway itself. Translated to HTTP in
# app/errors.py. The domain layer doesn't know about status codes, only
# semantics.
#
# These are the errors the gateway itself raises when it can't complete the
# forward: it never connected, it connected but didn't get a response in
# time, or the route is blocked. When the target service does respond, with
# any code including its own 4xx/5xx, that response is returned to the
# client as-is, without going through this envelope.

from __future__ import annotations


class DomainError(Exception):
    code = "error_dominio"
    message = "Ocurrió un error inesperado."

    def __init__(self, message: str | None = None, **details: object) -> None:
        super().__init__(message or self.message)
        if message:
            self.message = message
        self.details = details or None


class InternalRouteNotAllowed(DomainError):
    code = "recurso_no_encontrado"
    message = "El recurso solicitado no existe."


class UpstreamUnavailable(DomainError):
    code = "servicio_no_disponible"
    message = "El servicio no está disponible en este momento. Intenta de nuevo más tarde."


class UpstreamTimeout(DomainError):
    code = "servicio_no_responde"
    message = "El servicio tardó demasiado en responder. Intenta de nuevo más tarde."
