# Domain entities.
#
# Plain dataclasses, no FastAPI or SQLAlchemy dependency.

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from uuid import UUID


@dataclass
class Person:
    id: UUID
    first_name: str
    last_name: str
    email: str
    hash_password: str
    created_at: datetime
    document_type_id: int
    document_number: str
    phone_country_code: str
    phone_number: str
    date_of_birth: date
    # Optional: only guardian registration collects it today (see GuardianData);
    # a teacher's Person row is created without it.
    document_issued_at: date | None = None

    # Reassembles the E.164 phone number from its stored parts. Only
    # needed where a single display string is expected, e.g. the
    # guardian_phone shown to a teacher in internal_service.py.
    def phone_e164(self) -> str:
        return f"+{self.phone_country_code}{self.phone_number}"


@dataclass
class Guardian:
    id: UUID
    person_id: UUID
    relationship_type_id: int
    # Encrypted at rest (see infrastructure/security.py's TotpEncryptor), never
    # stored or logged in plain text. None until the guardian completes 2FA
    # setup; totp_enabled only flips to True after a real code from their
    # authenticator app is verified, not just when a secret is generated (see
    # TotpService.setup vs .verify) — otherwise a half-finished setup (secret
    # saved, QR never scanned) would lock the guardian out with no way in.
    totp_secret: str | None = None
    totp_enabled: bool = False


@dataclass
class DocumentType:
    id: int
    name: str


@dataclass
class RelationshipType:
    id: int
    name: str


@dataclass
class SupportCondition:
    id: int
    name: str


@dataclass
class Avatar:
    id: int
    name: str
    image_path: str


# The one catalog entry that means "the family will type their own condition
# instead of picking one of the predetermined ones" (see
# app/infrastructure/models.py's students.support_condition_other). Matched by
# name rather than a hardcoded id: the catalog lives in the database (see
# migration 0004), so its ids are only stable in practice, never guaranteed.
SUPPORT_CONDITION_NAME_OTHER = "Otra condición (especificar)"


@dataclass
class Teacher:
    id: UUID
    person_id: UUID
    institution: str


@dataclass
class Student:
    id: UUID
    guardian_id: UUID
    first_name: str
    last_name: str
    date_of_birth: date
    hash_pin: str
    avatar_id: int
    support_condition_id: int
    # Only set when support_condition_id points to the "Otra condición
    # (especificar)" catalog entry.
    support_condition_other: str | None = None
    # Unlike support_condition_id, this one stays genuinely optional: a free
    # text note for anything else the family wants the teacher to know.
    additional_support_need: str | None = None


@dataclass
class Consent:
    id: UUID
    guardian_id: UUID
    student_id: UUID
    policy_version: str
    granted_at: datetime
    accepts_data_processing: bool = False
    authorizes_support_condition: bool = False


# Bundles the three entities created together in one transaction.
@dataclass
class GuardianRegistrationPayload:
    person: Person
    guardian: Guardian
    student: Student
    consent: Consent


@dataclass
class PersonWithRole:
    person: Person
    role: str  # "guardian" or "teacher" here. The JWT role claim also has "student" for student profiles.
    guardian: Guardian | None = None
    teacher: Teacher | None = None
    students: list[Student] = field(default_factory=list)
