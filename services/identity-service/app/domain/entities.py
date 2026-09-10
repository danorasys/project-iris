"""Domain entities.

Plain dataclasses, no FastAPI or SQLAlchemy dependency.
"""

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
    phone: str
    date_of_birth: date


@dataclass
class Guardian:
    id: UUID
    person_id: UUID
    relationship_type_id: int


@dataclass
class DocumentType:
    id: int
    name: str


@dataclass
class RelationshipType:
    id: int
    name: str


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
    avatar: str
    support_condition: str | None = None


@dataclass
class Consent:
    id: UUID
    guardian_id: UUID
    student_id: UUID
    policy_version: str
    granted_at: datetime
    authorizes_support_condition: bool = False


@dataclass
class GuardianRegistrationPayload:
    """Bundles the three entities created together in one transaction."""

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
