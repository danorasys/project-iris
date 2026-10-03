# Domain entities. classroom-service owns Classroom and Enrollment.
#
# Plain dataclasses, no FastAPI or SQLAlchemy dependency.
#
# teacher_id and student_id are reference UUIDs pointing at identity-service,
# with no real foreign key across databases.

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
    # Where the logo lives inside the private bucket, never a public URL.
    logo_key: str | None = None

    @property
    def logo_file(self) -> str | None:
        # Last part of the key. It's random and changes on every upload.
        return self.logo_key.rsplit("/", 1)[-1] if self.logo_key else None


@dataclass
class Enrollment:
    id: UUID
    student_id: UUID
    classroom_id: UUID
    status: str
    requested_at: datetime
    resolved_at: datetime | None = None


# Where Caddy has to fetch a file from in Garage, with a signature that is
# only valid for that one GET. The service never reads the file itself.
@dataclass(frozen=True)
class SignedDownload:
    path: str
    authorization: str
    amz_date: str
    content_sha256: str


# Result of validating an access token against
# identity-service's /internal/tokens/validate.
@dataclass
class UserClaims:
    sub: UUID
    role: str
    extra: dict[str, str] = field(default_factory=dict)


# Result of identity-service's /internal/students/{id}. Used to enrich lists
# of enrolled students and requests with the student's name/avatar and the
# guardian's contact info.
@dataclass
class StudentInfo:
    student_id: UUID
    first_name: str
    avatar_id: int
    guardian_first_name: str
    guardian_last_name: str
    guardian_email: str
    guardian_phone: str
    # The id the guardian signs in with, so notification-service can tell
    # them about their kid's requests.
    guardian_person_id: UUID
