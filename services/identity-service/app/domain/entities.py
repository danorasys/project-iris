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
    # Both registrations ask for it now. None only on accounts made before
    # the teacher's registration asked for it.
    document_issued_at: date | None = None
    # 2FA of the account (guardians and teachers). Encrypted at rest (see
    # infrastructure/security.py's TotpEncryptor), never stored or logged in
    # plain text. totp_enabled only turns True after a real code from the
    # authenticator app is checked (TotpService.verify), so a half finished
    # setup (secret saved, QR never scanned) never locks anyone out.
    totp_secret: str | None = None
    totp_enabled: bool = False

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


# Where Caddy has to fetch a file from in Garage, with a signature that is
# only valid for that one GET. The service never reads the file itself.
@dataclass(frozen=True)
class SignedDownload:
    path: str
    authorization: str
    amz_date: str
    content_sha256: str


@dataclass
class Avatar:
    id: int
    name: str
    # Place in identity-service's bucket, e.g. "avatars/avatar-1.png". The
    # image is served by GET /catalogs/avatars/{id}/image.
    image_key: str
    # Its main color, "#rrggbb", for the kid's banner in the parents' portal.
    accent_color: str = "#1f62bf"


# The one catalog entry that means "the family will type their own condition
# instead of picking one of the predetermined ones" (see
# app/infrastructure/models.py's students.support_condition_other). Matched by
# name rather than a hardcoded id: the catalog lives in the database (see
# migration 0004), so its ids are only stable in practice, never guaranteed.
SUPPORT_CONDITION_NAME_OTHER = "Otra condición (especificar)"
# The entry for families that don't want to say. It can't go together with
# any other condition, it would contradict itself.
SUPPORT_CONDITION_NAME_PREFER_NOT_TO_SPECIFY = "Prefiero no especificar"


@dataclass
class Teacher:
    id: UUID
    person_id: UUID
    # Optional, not every teacher works for a school.
    institution: str | None


# Levels of a study, from the shortest to the longest. The web app shows
# them in Spanish (técnico, tecnólogo, profesional...).
STUDY_LEVELS = ("technical", "technologist", "professional", "specialization", "masters", "doctorate")


# One study of a teacher: finished on ended_on (the first day of that month,
# the form only asks for month and year), or still in progress (then there's
# no end).
@dataclass
class TeacherStudy:
    level: str
    title: str
    institution: str
    ended_on: date | None
    in_progress: bool


# One job of a teacher. Dates are kept as the first day of their month, the
# form only asks for month and year. No ended_on means they still work there.
@dataclass
class TeacherExperience:
    role: str
    place: str
    started_on: date
    ended_on: date | None
    description: str | None = None


# What a teacher tells the families about themselves (HU-96). Everything is
# optional, an empty profile is a valid one. Never contact or ID data.
@dataclass
class TeacherProfile:
    about: str | None = None
    studies: list[TeacherStudy] = field(default_factory=list)
    experiences: list[TeacherExperience] = field(default_factory=list)

    # Studies and jobs always go in the order the families should read them,
    # the newest on top, no matter the order they were typed in. Done here,
    # so it holds when the profile is saved and also when it's read back.
    def __post_init__(self) -> None:
        self.studies = sorted(self.studies, key=study_order)
        self.experiences = sorted(self.experiences, key=experience_order)


# What's being studied now goes first, then the most recently finished. When
# two tie (both in progress, or the same month), the higher level goes first:
# a doctorate before a technologist degree.
def study_order(study: TeacherStudy) -> tuple[bool, int, int]:
    ended = study.ended_on.toordinal() if study.ended_on else 0
    return (not study.in_progress, -ended, -STUDY_LEVELS.index(study.level))


# Where they work now goes first, then the job that ended most recently. When
# two tie (both current, or the same end month), the one started later goes
# first.
def experience_order(job: TeacherExperience) -> tuple[bool, int, int]:
    ended = job.ended_on.toordinal() if job.ended_on else 0
    return (job.ended_on is not None, -ended, -job.started_on.toordinal())


@dataclass
class Student:
    id: UUID
    guardian_id: UUID
    first_name: str
    last_name: str
    date_of_birth: date
    hash_pin: str
    avatar_id: int
    # A kid can have more than one condition, so this is a list of catalog
    # ids, always with at least one and sorted from lowest to highest.
    support_condition_ids: list[int]
    # Only set when one of the conditions is the "Otra condición
    # (especificar)" catalog entry.
    support_condition_other: str | None = None
    # Unlike the conditions, this one stays genuinely optional: a free
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


# A teacher accepting how IRIS treats their personal data, at registration
# (Ley 1581 de 2012), against the version of the privacy policy they saw.
@dataclass
class TeacherConsent:
    id: UUID
    teacher_id: UUID
    policy_version: str
    granted_at: datetime
    accepts_data_processing: bool


# How a session ended, kept in the session history. The same words the
# session service uses when it closes one.
SESSION_END_REASONS = (
    "logout",  # the person signed out
    "user_request",  # "Cerrar todas las sesiones"
    "password_changed",  # the password changed, every session is closed
    "refresh_token_reuse",  # a copy of the session's key was used again
    "portal_2fa_repeated_lock",  # too many wrong 2FA codes, closed for safety
)

# Who can have a session in the history. Students' sessions are not kept:
# they are kids, and their device is the family's one anyway.
SESSION_ROLES = ("guardian", "teacher")


# One sign-in of an adult, so profile_changes.session_id can be checked
# against it after Redis forgot it. Only the browser and system families,
# never the full User-Agent or the IP.
@dataclass
class SessionRecord:
    session_id: str
    person_id: UUID
    role: str
    started_at: datetime
    browser: str | None
    operating_system: str | None
    last_active_at: datetime | None = None
    ended_at: datetime | None = None
    end_reason: str | None = None


# Version of the sentence accepted before saving profile changes:
#   "Declaro que la información que modifiqué es correcta y veraz."
# If the sentence changes, this changes too.
PROFILE_DECLARATION_VERSION = "2026-10-01"


# One saved change to a profile: who, when, from which session, which fields
# and which declaration. Field names only, never values. student_id is set
# when a guardian changed a kid's data.
@dataclass
class ProfileChange:
    id: UUID
    person_id: UUID
    session_id: str | None
    changed_fields: list[str]
    declaration_version: str
    changed_at: datetime
    student_id: UUID | None = None


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
