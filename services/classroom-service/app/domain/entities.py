"""Domain entities. classroom-service owns Classroom and Enrollment.

Plain dataclasses, no FastAPI or SQLAlchemy dependency.

teacher_id and student_id are reference UUIDs pointing at identity-service,
with no real foreign key across databases.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

STATUS_PENDING = "pendiente"
STATUS_ACCEPTED = "aceptada"
STATUS_REJECTED = "rechazada"


@dataclass
class Classroom:
    id: UUID
    teacher_id: UUID
    name: str
    description: str
    enrollment_code: str
    created_at: datetime
    logo_url: str | None = None


@dataclass
class Enrollment:
    id: UUID
    student_id: UUID
    classroom_id: UUID
    status: str
    requested_at: datetime
    resolved_at: datetime | None = None


@dataclass
class UserClaims:
    """Result of validating an access token against
    identity-service's /internal/tokens/validate."""

    sub: UUID
    role: str
    extra: dict[str, str] = field(default_factory=dict)


@dataclass
class StudentInfo:
    """Result of identity-service's /internal/students/{id}. Used to
    enrich lists of enrolled students and requests with the student's name/avatar
    and the guardian's contact info."""

    student_id: UUID
    first_name: str
    avatar: str
    guardian_first_name: str
    guardian_last_name: str
    guardian_email: str
    guardian_phone: str
