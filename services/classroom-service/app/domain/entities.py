# Domain entities: classroom-service owns Classroom and Enrollment. Plain
# dataclasses. teacher_id and student_id point to identity-service, with no
# foreign key across databases.

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

STATUS_PENDING = "pendiente"
STATUS_ACCEPTED = "aceptada"
STATUS_REJECTED = "rechazada"

# The colors a teacher can pick for the classroom's avatar, the initials of
# its name on that color (the web app draws it). Same list as the CHECK in
# the database.
CLASSROOM_COLORS = ("blue", "navy", "orange", "green", "gold")
DEFAULT_CLASSROOM_COLOR = "blue"

# The subject of a classroom: the nine mandatory areas of basic education
# (Ley 115 de 1994, art. 23) plus "other", for what doesn't fit in them.
# Same list as the CHECK in the database.
CLASSROOM_AREAS = (
    "natural_sciences",
    "social_sciences",
    "arts",
    "ethics",
    "physical_education",
    "religion",
    "humanities",
    "mathematics",
    "technology",
    "other",
)

# With "other" the teacher writes which area it is, in a few words.
OTHER_AREA = "other"
AREA_OTHER_MAX_LENGTH = 60

# The grade a classroom is for: first to fifth, the primary school kids IRIS
# is made for. Only one, like the DBA, which go grade by grade.
CLASSROOM_GRADES = (1, 2, 3, 4, 5)

# The code a family types to ask to join (HU-40): 8 characters with at least
# one letter, one number and one symbol. Without the ones that look alike
# (I, L, O, 0, 1), since it's read out loud or copied by hand.
ENROLLMENT_CODE_LENGTH = 8
CODE_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ"
CODE_DIGITS = "23456789"
CODE_SYMBOLS = "#$%&*+?@"


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
    color: str = DEFAULT_CLASSROOM_COLOR
    # Required for every classroom since HU-100. Empty only in the ones
    # created before, until the teacher edits them.
    area: str | None = None
    # Only with area "other": the area written by the teacher.
    area_other: str | None = None
    grade: int | None = None
    # When its teacher deleted their account (HU-92). The class stays for
    # its kids, but takes no new requests and nobody can change it.
    teacher_left_at: datetime | None = None

    @property
    def has_teacher(self) -> bool:
        return self.teacher_left_at is None

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


# How many students a classroom has (accepted) and how many requests wait
# for the teacher's answer (pending).
@dataclass(frozen=True)
class EnrollmentCounts:
    pending: int = 0
    accepted: int = 0


# One kid of a guardian, as identity-service knows them. Used to show the
# parents' portal the classes of each kid.
@dataclass(frozen=True)
class GuardianStudent:
    student_id: UUID
    first_name: str
    avatar_id: int


# Where Caddy has to fetch a file from in Garage, with a signature that is
# only valid for that one GET. The service never reads the file itself.
@dataclass(frozen=True)
class SignedDownload:
    path: str
    authorization: str
    amz_date: str
    content_sha256: str


# What a family can already see of a classroom, from content-service: its
# published lessons and the units with at least one of them.
@dataclass(frozen=True)
class PublishedContent:
    lessons: int = 0
    units: int = 0


# A teacher as a family sees them before and after joining a class (HU-97),
# from identity-service. Never their contact or document.
@dataclass(frozen=True)
class TeacherStudy:
    level: str
    title: str
    institution: str
    end_month: str | None
    in_progress: bool


@dataclass(frozen=True)
class TeacherExperience:
    role: str
    place: str
    start_month: str
    end_month: str | None
    description: str | None


@dataclass(frozen=True)
class TeacherPublicProfile:
    first_name: str
    last_name: str
    about: str | None
    # The school they said they work for, if any.
    institution: str | None = None
    studies: tuple[TeacherStudy, ...] = ()
    experiences: tuple[TeacherExperience, ...] = ()

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"


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

    @property
    def guardian_name(self) -> str:
        return f"{self.guardian_first_name} {self.guardian_last_name}"
