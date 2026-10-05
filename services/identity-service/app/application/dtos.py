# Application-layer input/output DTOs, independent of Pydantic so application/
# doesn't depend on FastAPI. The api/ layer maps its Pydantic schemas to and
# from these dataclasses.

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.domain.entities import TeacherProfile


@dataclass
class GuardianData:
    first_name: str
    last_name: str
    document_type_id: int
    document_number: str
    document_issued_at: date
    date_of_birth: date
    email: str
    password: str
    phone_country_code: str
    phone_number: str
    relationship_type_id: int


@dataclass
class FirstStudentData:
    first_name: str
    last_name: str
    date_of_birth: date
    avatar_id: int
    pin: str
    support_condition_ids: list[int]
    support_condition_other: str | None = None
    additional_support_need: str | None = None


# The data of a kid a guardian can change later. The PIN is not here, it
# has its own flow.
@dataclass
class UpdateStudentData:
    first_name: str
    last_name: str
    date_of_birth: date
    avatar_id: int
    support_condition_ids: list[int]
    support_condition_other: str | None = None
    additional_support_need: str | None = None


@dataclass
class ConsentData:
    policy_version: str
    accepts_data_processing: bool
    authorizes_support_condition: bool


@dataclass
class UpdateGuardianProfileData:
    first_name: str
    last_name: str
    date_of_birth: date
    phone_country_code: str
    phone_number: str
    relationship_type_id: int


# What a teacher can change about themselves (HU-71). Like the guardian's,
# but with the institution instead of the relationship with a kid.
@dataclass
class UpdateTeacherAccountData:
    first_name: str
    last_name: str
    date_of_birth: date
    phone_country_code: str
    phone_number: str
    institution: str | None


@dataclass
class TeacherData:
    first_name: str
    last_name: str
    email: str
    password: str
    institution: str | None
    document_type_id: int
    document_number: str
    date_of_birth: date
    phone_country_code: str
    phone_number: str
    document_issued_at: date
    # Version of the privacy policy the teacher accepted.
    consent_policy_version: str
    # The teacher can leave it for later, from their panel.
    profile: TeacherProfile | None = None


@dataclass
class IssuedTokens:
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    # The session both tokens belong to (their "sid").
    session_id: str = ""


@dataclass
class TotpSetupResult:
    qr_code_data_uri: str
    manual_entry_key: str
