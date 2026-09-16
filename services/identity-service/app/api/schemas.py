from __future__ import annotations

import re
from datetime import date
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


MINIMUM_ADULT_AGE = 18
PHONE_PATTERN = r"^\d{10}$"
# The guardian form's country-flag picker (react-phone-number-input) always
# hands back a calling code (no leading "+", e.g. "57") and a national
# significant number (digits only, e.g. "3001234567") as two separate
# values — stored as two columns instead of one combined E.164 string, see
# app/infrastructure/models.py's PersonModel.
PHONE_COUNTRY_CODE_PATTERN = r"^[1-9]\d{0,2}$"
PHONE_NUMBER_PATTERN = r"^\d{4,14}$"
# E.164 caps a phone number at 15 digits total, country code included.
E164_MAX_DIGITS = 15



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
    document_issued_at: date
    email: EmailStr
    phone_country_code: str = Field(
        pattern=PHONE_COUNTRY_CODE_PATTERN, description="Country calling code without '+', e.g. '57'."
    )
    phone_number: str = Field(
        pattern=PHONE_NUMBER_PATTERN, description="National significant number, digits only, e.g. '3001234567'."
    )
    relationship_type_id: int = Field(gt=0)
    password: str = Field(min_length=8, max_length=128)
    # Confirmation-only: checked against `password` below, never stored or
    # forwarded past this schema (same pattern as FirstStudentDataRequest's
    # pin/pin_confirmation).
    password_confirmation: str = Field(min_length=8, max_length=128)

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, v: date) -> date:
        return _validar_mayor_de_edad(v)

    @field_validator("document_issued_at")
    @classmethod
    def validate_document_issued_at_not_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("La fecha de expedición del documento no puede ser una fecha futura.")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _validar_password(v)

    @model_validator(mode="after")
    def validate_document_issued_after_birth(self) -> "GuardianDataRequest":
        if self.document_issued_at < self.date_of_birth:
            raise ValueError("La fecha de expedición del documento no puede ser anterior a la fecha de nacimiento.")
        return self

    @model_validator(mode="after")
    def validate_passwords_match(self) -> "GuardianDataRequest":
        if self.password != self.password_confirmation:
            raise ValueError("Las contraseñas no coinciden.")
        return self

    @model_validator(mode="after")
    def validate_phone_total_length(self) -> "GuardianDataRequest":
        if len(self.phone_country_code) + len(self.phone_number) > E164_MAX_DIGITS:
            raise ValueError(
                f"El código de país y el número telefónico no pueden sumar más de {E164_MAX_DIGITS} dígitos."
            )
        return self


class FirstStudentDataRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    date_of_birth: date
    avatar_id: int = Field(gt=0)
    pin: str = Field(min_length=4, max_length=4)
    pin_confirmation: str = Field(min_length=4, max_length=4)
    support_condition_id: int = Field(gt=0)
    # Whether this must be set (and whether it's even allowed) depends on
    # *which* support_condition_id was chosen ("Otra condición (especificar)"
    # vs. any other catalog entry) — that requires looking the id up in the
    # database, so it's checked in AuthService/GuardianService, not here.
    support_condition_other: str | None = Field(default=None, max_length=200)
    additional_support_need: str | None = Field(default=None, max_length=500)

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
        # Choosing a support_condition_id on FirstStudentDataRequest is
        # mandatory (it always includes a "prefiero no especificar" option
        # for families with nothing to disclose), but authorizing the school
        # to see whatever was chosen is a separate consent, asked here.
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
    pin: str = Field(min_length=4, max_length=4)


class RefreshRequest(BaseModel):
    refresh_token: str


class CreateAdditionalStudentRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    date_of_birth: date
    avatar_id: int = Field(gt=0)
    pin: str = Field(min_length=4, max_length=4)
    support_condition_id: int = Field(gt=0)
    support_condition_other: str | None = Field(default=None, max_length=200)
    additional_support_need: str | None = Field(default=None, max_length=500)

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
    avatar_id: int
    date_of_birth: date
    support_condition_id: int
    support_condition_other: str | None = None
    additional_support_need: str | None = None


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
    student_avatar_id: int
    guardian_first_name: str
    guardian_last_name: str
    guardian_email: EmailStr
    guardian_phone: str


class DocumentTypeResponse(BaseModel):
    id: int
    name: str


class UpdateStudentAvatarRequest(BaseModel):
    avatar_id: int = Field(gt=0)


class TotpSetupResponse(BaseModel):
    qr_code_data_uri: str
    manual_entry_key: str


class TotpVerifyRequest(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")


class RelationshipTypeResponse(BaseModel):
    id: int
    name: str


class SupportConditionResponse(BaseModel):
    id: int
    name: str


class AvatarResponse(BaseModel):
    id: int
    name: str
    image_path: str


class GuardianProfileResponse(BaseModel):
    first_name: str
    last_name: str
    date_of_birth: date
    # These fields are shown as read-only in the guardian's profile screen.
    # They identify the account itself, so letting someone edit them here
    # would mean changing the document or login without any extra checks.
    document_type_id: int
    document_number: str
    document_issued_at: date
    email: EmailStr
    phone_country_code: str
    phone_number: str
    relationship_type_id: int


class UpdateGuardianProfileRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    date_of_birth: date
    phone_country_code: str = Field(pattern=PHONE_COUNTRY_CODE_PATTERN)
    phone_number: str = Field(pattern=PHONE_NUMBER_PATTERN)
    relationship_type_id: int = Field(gt=0)

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, v: date) -> date:
        return _validar_mayor_de_edad(v)

    @model_validator(mode="after")
    def validate_phone_total_length(self) -> "UpdateGuardianProfileRequest":
        if len(self.phone_country_code) + len(self.phone_number) > E164_MAX_DIGITS:
            raise ValueError(
                f"El código de país y el número telefónico no pueden sumar más de {E164_MAX_DIGITS} dígitos."
            )
        return self


class ChangePasswordRequest(BaseModel):
    password: str = Field(min_length=8, max_length=128)
    # Confirmation-only: checked against `password` below, never stored or
    # forwarded past this schema (same pattern as GuardianDataRequest's
    # password/password_confirmation at registration).
    password_confirmation: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _validar_password(v)

    @model_validator(mode="after")
    def validate_passwords_match(self) -> "ChangePasswordRequest":
        if self.password != self.password_confirmation:
            raise ValueError("Las contraseñas no coinciden.")
        return self


class ConfirmPasswordRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)
