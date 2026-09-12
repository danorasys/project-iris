"""Application-layer input/output DTOs, independent of Pydantic so application/
doesn't depend on FastAPI. The api/ layer maps its Pydantic schemas to and
from these dataclasses."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date


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
    avatar: str
    pin: str
    support_condition: str | None = None


@dataclass
class ConsentData:
    policy_version: str
    authorizes_support_condition: bool


@dataclass
class TeacherData:
    first_name: str
    last_name: str
    email: str
    password: str
    institution: str
    document_type_id: int
    document_number: str
    date_of_birth: date
    phone: str


@dataclass
class IssuedTokens:
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
