from __future__ import annotations

import re
from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


MINIMUM_ADULT_AGE = 18
PHONE_PATTERN = r"^\d{10}$"

# The 4 predetermined, permanent student avatars (illustrated portraits, not
# an administrable catalog, see students.avatar's CHECK constraint, migration
# 0007). A student chooses one of these interactively, by gaze, right after
# calibrating; registration just sends a default that gets overwritten later.
AvatarId = Literal["avatar1", "avatar2", "avatar3", "avatar4"]


def _validar_mayor_de_edad(v: date) -> date:
    today = date.today()
    if v > today:
        raise ValueError("La fecha de nacimiento no puede ser una fecha futura.")
    age = today.year - v.year - ((today.month, today.day) < (v.month, v.day))
    if age < MINIMUM_ADULT_AGE:
        raise ValueError(f"Debes ser mayor de edad ({MINIMUM_ADULT_AGE} años o más).")
    return v


# Same 5 requirements the registration forms already show and check on the
# frontend (PasswordRequirements.tsx). Repeating them here matters because
# the frontend check alone can be skipped by anyone calling this endpoint
# directly, min_length was the only thing actually stopping a weak password.
def _validar_password(v: str) -> str:
    if not re.search(r"[A-Z]", v):
        raise ValueError("La contraseña debe incluir al menos una letra mayúscula.")
    if not re.search(r"[a-z]", v):
        raise ValueError("La contraseña debe incluir al menos una letra minúscula.")
    if not re.search(r"[0-9]", v):
        raise ValueError("La contraseña debe incluir al menos un número.")
    if not re.search(r"[^A-Za-z0-9]", v):
        raise ValueError("La contraseña debe incluir al menos un símbolo (por ejemplo, !@#$%).")
    return v


class GuardianDataRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    document_type_id: int = Field(gt=0)
    document_number: str = Field(min_length=1, max_length=30)
    date_of_birth: date
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    phone: str = Field(pattern=PHONE_PATTERN, description="Exactly 10 numeric digits.")
    relationship_type_id: int = Field(gt=0)

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, v: date) -> date:
        return _validar_mayor_de_edad(v)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _validar_password(v)


class FirstStudentDataRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    date_of_birth: date
    avatar: AvatarId
    pin: str = Field(min_length=4, max_length=6)
    pin_confirmation: str = Field(min_length=4, max_length=6)
    support_condition: str | None = Field(default=None, max_length=500)

    @field_validator("date_of_birth")
    @classmethod
    def date_of_birth_not_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("La fecha de nacimiento no puede ser una fecha futura.")
        return v

    @field_validator("pin", "pin_confirmation")
    @classmethod
    def pin_digits_only(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("El PIN debe contener solo dígitos.")
        return v


class ConsentDataRequest(BaseModel):
    policy_version: str = Field(min_length=1, max_length=20)
    accepts_data_processing: bool
    authorizes_support_condition: bool

    @field_validator("accepts_data_processing")
    @classmethod
    def must_accept(cls, v: bool) -> bool:
        if not v:
            raise ValueError("El consentimiento de tratamiento de datos es obligatorio.")
        return v

    @field_validator("authorizes_support_condition")
    @classmethod
    def must_authorize_support_condition(cls, v: bool) -> bool:
        # Authorizing the sharing mechanism is required. The actual support_condition
        # field on FirstStudentDataRequest stays optional and can be empty.
        if not v:
            raise ValueError("La autorización para compartir una condición o necesidad de apoyo es obligatoria.")
        return v


class GuardianRegistrationRequest(BaseModel):
    guardian: GuardianDataRequest
    student: FirstStudentDataRequest
    consent: ConsentDataRequest

    @field_validator("student")
    @classmethod
    def pins_match(cls, v: FirstStudentDataRequest) -> FirstStudentDataRequest:
        if v.pin != v.pin_confirmation:
            raise ValueError("El PIN y su confirmación no coinciden.")
        return v


class TeacherRegistrationRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    institution: str = Field(min_length=1, max_length=200)
    document_type_id: int = Field(gt=0)
    document_number: str = Field(min_length=1, max_length=30)
    date_of_birth: date
    phone: str = Field(pattern=PHONE_PATTERN, description="Exactly 10 numeric digits.")

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, v: date) -> date:
        return _validar_mayor_de_edad(v)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _validar_password(v)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class StudentProfileLoginRequest(BaseModel):
    student_id: UUID
    pin: str = Field(min_length=4, max_length=6)


class RefreshRequest(BaseModel):
    refresh_token: str


class CreateAdditionalStudentRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    date_of_birth: date
    avatar: AvatarId
    pin: str = Field(min_length=4, max_length=6)
    support_condition: str | None = Field(default=None, max_length=500)

    @field_validator("pin")
    @classmethod
    def pin_digits_only(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("El PIN debe contener solo dígitos.")
        return v


class TokensResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class StudentProfileResponse(BaseModel):
    id: UUID
    first_name: str
    avatar: str
    date_of_birth: date
    support_condition: str | None = None


class CurrentUserResponse(BaseModel):
    id: UUID
    first_name: str
    last_name: str
    email: EmailStr
    role: str


class TokenClaimsResponse(BaseModel):
    sub: str
    role: str
    extra: dict[str, str] = Field(default_factory=dict)


class StudentWithGuardianResponse(BaseModel):
    student_id: UUID
    student_first_name: str
    student_avatar: str
    guardian_first_name: str
    guardian_last_name: str
    guardian_email: EmailStr
    guardian_phone: str


class DocumentTypeResponse(BaseModel):
    id: int
    name: str


class UpdateStudentAvatarRequest(BaseModel):
    avatar: AvatarId


class RelationshipTypeResponse(BaseModel):
    id: int
    name: str
