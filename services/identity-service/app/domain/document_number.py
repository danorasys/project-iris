# Format validation for document_number, based on which document_type was
# chosen at registration.
#
# Each of the 3 entries in the document_types catalog (see migration 0004's
# seed data) is a real, fixed government document format, not a business rule
# that changes at runtime — so, like SUPPORT_CONDITION_NAME_OTHER in
# entities.py, it's matched by catalog name here instead of a hardcoded id:
# ids are only stable in practice, never guaranteed, since the catalog lives in
# the database. Mirrors apps/web's features/auth/lib/documentNumber.ts, which
# enforces the same patterns client-side for immediate feedback.

from __future__ import annotations

import re

DOCUMENT_TYPE_NAME_CITIZENSHIP_ID = "Cédula de ciudadanía"
DOCUMENT_TYPE_NAME_FOREIGNER_ID = "Cédula de extranjería"
DOCUMENT_TYPE_NAME_PASSPORT = "Pasaporte"

_PATTERNS: dict[str, re.Pattern[str]] = {
    DOCUMENT_TYPE_NAME_CITIZENSHIP_ID: re.compile(r"^\d{6,10}$"),
    DOCUMENT_TYPE_NAME_FOREIGNER_ID: re.compile(r"^\d{6,12}$"),
    DOCUMENT_TYPE_NAME_PASSPORT: re.compile(r"^[A-Za-z0-9]{6,12}$"),
}

_REQUIREMENT_MESSAGES: dict[str, str] = {
    DOCUMENT_TYPE_NAME_CITIZENSHIP_ID: "Ingresa un número de cédula de ciudadanía válido.",
    DOCUMENT_TYPE_NAME_FOREIGNER_ID: "Ingresa un número de cédula de extranjería válido.",
    DOCUMENT_TYPE_NAME_PASSPORT: "Ingresa un número de pasaporte válido.",
}


# Returns the Spanish error message if document_number doesn't match the
# format expected for document_type_name, or None if it's valid. A
# document type outside the 3 known ones is left unconstrained — it
# shouldn't happen, the caller already validated the id exists in the
# catalog, but this stays permissive rather than blocking registration
# over a type this hasn't been taught a format for.
def document_number_format_error(document_type_name: str, document_number: str) -> str | None:
    pattern = _PATTERNS.get(document_type_name)
    if pattern is None:
        return None
    if pattern.match(document_number):
        return None
    return _REQUIREMENT_MESSAGES[document_type_name]
