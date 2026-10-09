from __future__ import annotations

import re
import unicodedata
from datetime import date
from typing import Annotated, Literal
from uuid import UUID

import phonenumbers
from pydantic import (
    AfterValidator,
    BaseModel,
    EmailStr,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.domain.entities import TeacherExperience, TeacherProfile, TeacherStudy


MINIMUM_ADULT_AGE = 18
# Anything older is almost surely a typo in the year.
MAXIMUM_AGE = 120
# The registration forms' country-flag picker (react-phone-number-input) always
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
    if age > MAXIMUM_AGE:
        raise ValueError("Revisa el año de la fecha de nacimiento.")
    return v


# Names: letters from any language (accents and ñ included), spaces and the
# few signs real names use, like in "María-José O'Neil". It needs at least
# one letter, so "---" or "123" don't pass. Extra spaces inside are joined.
_NAME_SIGNS = " '-."


def _validar_nombre(v: str) -> str:
    if not any(ch.isalpha() for ch in v) or not all(ch.isalpha() or ch in _NAME_SIGNS for ch in v):
        raise ValueError("Usa solo letras, espacios, guion, apóstrofo o punto.")
    return " ".join(v.split())


PersonName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=120),
    AfterValidator(_validar_nombre),
]


# Checks that the number exists for that country (Colombian mobiles start
# with 3, for example) with Google's libphonenumber, the same rules the web
# form uses. It works offline, the number never leaves the server.
def _validar_telefono(country_code: str, number: str) -> None:
    try:
        parsed = phonenumbers.parse(f"+{country_code}{number}")
    except phonenumbers.NumberParseException:
        parsed = None
    if parsed is None or not phonenumbers.is_valid_number(parsed):
        raise ValueError("El número de teléfono no es válido para el país elegido.")


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
    first_name: PersonName
    last_name: PersonName
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
    def validate_phone(self) -> "GuardianDataRequest":
        if len(self.phone_country_code) + len(self.phone_number) > E164_MAX_DIGITS:
            raise ValueError(
                f"El código de país y el número telefónico no pueden sumar más de {E164_MAX_DIGITS} dígitos."
            )
        _validar_telefono(self.phone_country_code, self.phone_number)
        return self


def _sorted_without_repeats(ids: list[int]) -> list[int]:
    if len(set(ids)) != len(ids):
        raise ValueError("Hay una condición repetida.")
    return sorted(ids)


# The conditions of a kid, as ids of the catalog: at least one, none
# repeated. They are kept sorted, so the same choice always looks the same.
# Which ones can go together is checked in the services, that needs the
# catalog from the database (see app/application/support_conditions.py).
SupportConditionIds = Annotated[
    list[Annotated[int, Field(gt=0)]],
    Field(min_length=1, max_length=30),
    AfterValidator(_sorted_without_repeats),
]


class FirstStudentDataRequest(BaseModel):
    first_name: PersonName
    last_name: PersonName
    date_of_birth: date
    avatar_id: int = Field(gt=0)
    pin: str = Field(min_length=4, max_length=4)
    pin_confirmation: str = Field(min_length=4, max_length=4)
    support_condition_ids: SupportConditionIds
    # Whether this must be set (and whether it's even allowed) depends on
    # *which* conditions were chosen ("Otra condición (especificar)" among
    # them or not) — that requires looking the ids up in the database, so
    # it's checked in the services, not here.
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
        # Choosing support_condition_ids on FirstStudentDataRequest is
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


# ---------------------------------------------------------------------------
# Teacher profile (HU-96)
# ---------------------------------------------------------------------------

# Nothing in IRIS is older than this, a year before it is surely a typo.
EARLIEST_PROFILE_YEAR = 1950
MAX_STUDIES = 10
MAX_EXPERIENCES = 10
MONTH_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"

StudyLevel = Literal["technical", "technologist", "professional", "specialization", "masters", "doctorate"]


# Free text typed by the teacher, already trimmed: no invisible control
# characters, only line breaks and tabs (the "about me" can have several
# lines). React shows it as plain text, never as HTML.
_ALLOWED_CONTROL_CHARS = ("\n", "\t")


def _no_control_chars(v: str) -> str:
    if any(unicodedata.category(ch) == "Cc" and ch not in _ALLOWED_CONTROL_CHARS for ch in v):
        raise ValueError("El texto tiene caracteres no permitidos.")
    return v


def _text(max_length: int, min_length: int = 0) -> StringConstraints:
    return StringConstraints(strip_whitespace=True, min_length=min_length, max_length=max_length)


EntryText = Annotated[str, _text(150, min_length=1), AfterValidator(_no_control_chars)]
AboutText = Annotated[str, _text(2000), AfterValidator(_no_control_chars)]
DescriptionText = Annotated[str, _text(2000), AfterValidator(_no_control_chars)]
InstitutionText = Annotated[str, _text(200), AfterValidator(_no_control_chars)]


def _month_to_date(v: str) -> date:
    year, month = v.split("-")
    return date(int(year), int(month), 1)


def _date_to_month(v: date) -> str:
    return f"{v.year:04d}-{v.month:02d}"


class TeacherStudyRequest(BaseModel):
    level: StudyLevel
    title: EntryText
    institution: EntryText
    # "YYYY-MM", the month and year it ended. None while it's in progress.
    end_month: str | None = Field(default=None, pattern=MONTH_PATTERN)
    in_progress: bool = False

    @model_validator(mode="after")
    def end_or_in_progress(self) -> "TeacherStudyRequest":
        if self.in_progress and self.end_month is not None:
            raise ValueError("Un estudio en curso no tiene fecha de finalización.")
        if not self.in_progress and self.end_month is None:
            raise ValueError("Indica el mes y el año en que terminaste o marca que está en curso.")
        if self.end_month is not None:
            ended = _month_to_date(self.end_month)
            if ended.year < EARLIEST_PROFILE_YEAR:
                raise ValueError("Revisa el año en que terminaste.")
            if ended > date.today().replace(day=1):
                raise ValueError("La fecha de finalización no puede ser futura, si aún no terminas márcalo en curso.")
        return self

    def to_entity(self) -> TeacherStudy:
        return TeacherStudy(
            level=self.level,
            title=self.title,
            institution=self.institution,
            ended_on=_month_to_date(self.end_month) if self.end_month else None,
            in_progress=self.in_progress,
        )


class TeacherExperienceRequest(BaseModel):
    role: EntryText
    place: EntryText
    # "YYYY-MM", what a month picker gives. No end_month means they still work there.
    start_month: str = Field(pattern=MONTH_PATTERN)
    end_month: str | None = Field(default=None, pattern=MONTH_PATTERN)
    description: DescriptionText | None = None

    @field_validator("description")
    @classmethod
    def empty_description_is_none(cls, v: str | None) -> str | None:
        return v or None

    @model_validator(mode="after")
    def months_in_order(self) -> "TeacherExperienceRequest":
        this_month = date.today().replace(day=1)
        started = _month_to_date(self.start_month)
        if started.year < EARLIEST_PROFILE_YEAR:
            raise ValueError("Revisa el año en que empezaste.")
        if started > this_month:
            raise ValueError("La fecha de inicio no puede ser futura.")
        if self.end_month is not None:
            ended = _month_to_date(self.end_month)
            if ended > this_month:
                raise ValueError("La fecha de fin no puede ser futura.")
            if ended < started:
                raise ValueError("La fecha de fin no puede ser anterior a la de inicio.")
        return self

    def to_entity(self) -> TeacherExperience:
        return TeacherExperience(
            role=self.role,
            place=self.place,
            started_on=_month_to_date(self.start_month),
            ended_on=_month_to_date(self.end_month) if self.end_month else None,
            description=self.description,
        )


# Everything optional: an empty profile is valid, the teacher can fill it in
# little by little.
class TeacherProfileRequest(BaseModel):
    about: AboutText | None = None
    studies: list[TeacherStudyRequest] = Field(default_factory=list, max_length=MAX_STUDIES)
    experiences: list[TeacherExperienceRequest] = Field(default_factory=list, max_length=MAX_EXPERIENCES)

    @field_validator("about")
    @classmethod
    def empty_text_is_none(cls, v: str | None) -> str | None:
        return v or None

    def to_entity(self) -> TeacherProfile:
        return TeacherProfile(
            about=self.about,
            studies=[study.to_entity() for study in self.studies],
            experiences=[job.to_entity() for job in self.experiences],
        )


# Editing the profile from Mi perfil (HU-96). Same body as at registration,
# plus the truthful declaration, like the personal data. At registration it
# isn't asked: creating the account already confirms everything typed.
class UpdateTeacherProfileRequest(TeacherProfileRequest):
    truthful_declaration: bool = Field(
        strict=True,
        description="Debe ser true: el docente declara que la información que modificó es correcta y veraz.",
    )

    @field_validator("truthful_declaration")
    @classmethod
    def validate_truthful_declaration(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Debes declarar que la información que modificaste es correcta y veraz.")
        return v


class TeacherStudyResponse(BaseModel):
    level: StudyLevel
    title: str
    institution: str
    end_month: str | None
    in_progress: bool


class TeacherExperienceResponse(BaseModel):
    role: str
    place: str
    start_month: str
    end_month: str | None
    description: str | None


class TeacherProfileResponse(BaseModel):
    about: str | None
    studies: list[TeacherStudyResponse]
    experiences: list[TeacherExperienceResponse]

    @classmethod
    def from_entity(cls, profile: TeacherProfile) -> "TeacherProfileResponse":
        return cls(
            about=profile.about,
            studies=[
                TeacherStudyResponse(
                    level=s.level,  # type: ignore[arg-type]
                    title=s.title,
                    institution=s.institution,
                    end_month=_date_to_month(s.ended_on) if s.ended_on else None,
                    in_progress=s.in_progress,
                )
                for s in profile.studies
            ],
            experiences=[
                TeacherExperienceResponse(
                    role=e.role,
                    place=e.place,
                    start_month=_date_to_month(e.started_on),
                    end_month=_date_to_month(e.ended_on) if e.ended_on else None,
                    description=e.description,
                )
                for e in profile.experiences
            ],
        )



# The teacher's own acceptance of the data treatment. Unlike the guardian's,
# there's no kid's condition to authorize, only their own data.
class TeacherConsentRequest(BaseModel):
    policy_version: str = Field(min_length=1, max_length=20)
    accepts_data_processing: bool

    @field_validator("accepts_data_processing")
    @classmethod
    def must_accept(cls, v: bool) -> bool:
        if not v:
            raise ValueError("El consentimiento de tratamiento de datos es obligatorio.")
        return v


class TeacherRegistrationRequest(BaseModel):
    first_name: PersonName
    last_name: PersonName
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    # Optional (HU-65): not every teacher works for a school.
    institution: InstitutionText | None = None
    document_type_id: int = Field(gt=0)
    document_number: str = Field(min_length=1, max_length=30)
    date_of_birth: date
    # Same country-flag picker as the guardian's form, so the two parts apart.
    phone_country_code: str = Field(
        pattern=PHONE_COUNTRY_CODE_PATTERN, description="Country calling code without '+', e.g. '57'."
    )
    phone_number: str = Field(
        pattern=PHONE_NUMBER_PATTERN, description="National significant number, digits only, e.g. '3001234567'."
    )
    # Same rules as the guardian's: not in the future, not before birth.
    document_issued_at: date
    consent: TeacherConsentRequest
    # Optional step of the registration, it can be filled in later.
    profile: TeacherProfileRequest | None = None

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

    @field_validator("institution")
    @classmethod
    def empty_institution_is_none(cls, v: str | None) -> str | None:
        return v or None

    @model_validator(mode="after")
    def validate_document_issued_after_birth(self) -> "TeacherRegistrationRequest":
        if self.document_issued_at < self.date_of_birth:
            raise ValueError("La fecha de expedición del documento no puede ser anterior a la fecha de nacimiento.")
        return self

    @model_validator(mode="after")
    def validate_phone(self) -> "TeacherRegistrationRequest":
        if len(self.phone_country_code) + len(self.phone_number) > E164_MAX_DIGITS:
            raise ValueError(
                f"El código de país y el número telefónico no pueden sumar más de {E164_MAX_DIGITS} dígitos."
            )
        _validar_telefono(self.phone_country_code, self.phone_number)
        return self

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


class CreateAdditionalStudentRequest(BaseModel):
    first_name: PersonName
    last_name: PersonName
    date_of_birth: date
    avatar_id: int = Field(gt=0)
    pin: str = Field(min_length=4, max_length=4)
    support_condition_ids: SupportConditionIds
    support_condition_other: str | None = Field(default=None, max_length=200)
    additional_support_need: str | None = Field(default=None, max_length=500)

    @field_validator("pin")
    @classmethod
    def pin_digits_only(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("El PIN debe contener solo dígitos.")
        return v


# The refresh token is not here on purpose, it goes in an HttpOnly cookie
# (see app/api/session_cookie.py).
class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# What the profile picker and the list of kids need. The list is open
# without the portal's 2FA code, so nothing sensitive (like the support
# condition) goes here, that is only in StudentDetailResponse.
class StudentProfileResponse(BaseModel):
    id: UUID
    first_name: str
    avatar_id: int
    date_of_birth: date


# Everything the guardian registered about a kid, only inside the portal.
class StudentDetailResponse(BaseModel):
    id: UUID
    first_name: str
    last_name: str
    date_of_birth: date
    avatar_id: int
    support_condition_ids: list[int]
    support_condition_other: str | None = None
    additional_support_need: str | None = None


class UpdateStudentRequest(BaseModel):
    first_name: PersonName
    last_name: PersonName
    date_of_birth: date
    avatar_id: int = Field(gt=0)
    support_condition_ids: SupportConditionIds
    # Whether this one is needed depends on the conditions chosen, which is
    # checked in GuardianService (it has to look the ids up in the database).
    support_condition_other: str | None = Field(default=None, max_length=200)
    additional_support_need: str | None = Field(default=None, max_length=500)
    # Same declaration as when the guardian edits their own profile.
    truthful_declaration: bool = Field(
        strict=True,
        description="Debe ser true: el tutor declara que la información que modificó es correcta y veraz.",
    )

    @field_validator("date_of_birth")
    @classmethod
    def date_of_birth_not_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("La fecha de nacimiento no puede ser una fecha futura.")
        return v

    @field_validator("support_condition_other", "additional_support_need")
    @classmethod
    def empty_text_is_no_text(cls, v: str | None) -> str | None:
        return (v or "").strip() or None

    @field_validator("truthful_declaration")
    @classmethod
    def validate_truthful_declaration(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Debes declarar que la información que modificaste es correcta y veraz.")
        return v


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
    guardian_person_id: UUID


class GuardianStudentResponse(BaseModel):
    student_id: UUID
    first_name: str
    avatar_id: int


class TeacherNameResponse(BaseModel):
    first_name: str
    last_name: str


# A teacher as families see them (HU-97): the name and the profile, the same
# shape as their own /teachers/me/profile. No email, phone or document.
class TeacherPublicProfileResponse(TeacherProfileResponse):
    first_name: str
    last_name: str
    institution: str | None


# Asked by notification-service before showing a guardian their tray: the
# notifications talk about their kids, so they need the portal's 2FA too.
class PortalAccessCheckRequest(BaseModel):
    person_id: UUID
    session_id: str = Field(min_length=1, max_length=64)
    # False only reads it. Loading the tray in the background must not keep
    # the portal open forever, only the guardian doing something does.
    renew: bool = False


class DocumentTypeResponse(BaseModel):
    id: int
    name: str


# Deleting the account (HU-91, HU-92) asks for the password again.
class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class TotpSetupResponse(BaseModel):
    qr_code_data_uri: str
    manual_entry_key: str


class TotpVerifyRequest(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")


class TotpStatusResponse(BaseModel):
    enabled: bool


class PortalChallengeResponse(BaseModel):
    # Wrong attempts since the last time the guardian got into the portal.
    failed_attempts_before: int


class RelationshipTypeResponse(BaseModel):
    id: int
    name: str


class SupportConditionResponse(BaseModel):
    id: int
    name: str


class AvatarResponse(BaseModel):
    # The image is at GET /catalogs/avatars/{id}/image.
    id: int
    name: str
    # Its main color, "#rrggbb", to paint the kid's banner with it.
    accent_color: str


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


# The teacher's own account, for their portal. Document type and number,
# email and issue date identify the account and are read-only there.
class TeacherAccountResponse(BaseModel):
    first_name: str
    last_name: str
    date_of_birth: date
    document_type_id: int
    document_number: str
    document_issued_at: date | None
    email: EmailStr
    phone_country_code: str
    phone_number: str
    institution: str | None


class UpdateGuardianProfileRequest(BaseModel):
    first_name: PersonName
    last_name: PersonName
    date_of_birth: date
    phone_country_code: str = Field(pattern=PHONE_COUNTRY_CODE_PATTERN)
    phone_number: str = Field(pattern=PHONE_NUMBER_PATTERN)
    relationship_type_id: int = Field(gt=0)
    # The checkbox "the information I changed is correct and true". The server
    # asks for it too, and strict so only a real true counts (not "yes" or 1).
    truthful_declaration: bool = Field(
        strict=True,
        description="Debe ser true: el tutor declara que la información que modificó es correcta y veraz.",
    )

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, v: date) -> date:
        return _validar_mayor_de_edad(v)

    @field_validator("truthful_declaration")
    @classmethod
    def validate_truthful_declaration(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Debes declarar que la información que modificaste es correcta y veraz.")
        return v

    @model_validator(mode="after")
    def validate_phone(self) -> "UpdateGuardianProfileRequest":
        if len(self.phone_country_code) + len(self.phone_number) > E164_MAX_DIGITS:
            raise ValueError(
                f"El código de país y el número telefónico no pueden sumar más de {E164_MAX_DIGITS} dígitos."
            )
        _validar_telefono(self.phone_country_code, self.phone_number)
        return self


class UpdateTeacherAccountRequest(BaseModel):
    first_name: PersonName
    last_name: PersonName
    date_of_birth: date
    phone_country_code: str = Field(pattern=PHONE_COUNTRY_CODE_PATTERN)
    phone_number: str = Field(pattern=PHONE_NUMBER_PATTERN)
    # Optional, like at registration: empty means none.
    institution: InstitutionText | None = None
    # Same checkbox as the guardian's, strict so only a real true counts.
    truthful_declaration: bool = Field(
        strict=True,
        description="Debe ser true: el docente declara que la información que modificó es correcta y veraz.",
    )

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, v: date) -> date:
        return _validar_mayor_de_edad(v)

    @field_validator("institution")
    @classmethod
    def empty_institution_is_none(cls, v: str | None) -> str | None:
        return v or None

    @field_validator("truthful_declaration")
    @classmethod
    def validate_truthful_declaration(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Debes declarar que la información que modificaste es correcta y veraz.")
        return v

    @model_validator(mode="after")
    def validate_phone(self) -> "UpdateTeacherAccountRequest":
        if len(self.phone_country_code) + len(self.phone_number) > E164_MAX_DIGITS:
            raise ValueError(
                f"El código de país y el número telefónico no pueden sumar más de {E164_MAX_DIGITS} dígitos."
            )
        _validar_telefono(self.phone_country_code, self.phone_number)
        return self


class CheckStudentPinRequest(BaseModel):
    current_pin: str = Field(pattern=r"^\d{4}$")


# A guardian sets a new PIN for one of their kids. Same idea as changing
# their own password: the current PIN and a fresh code from the
# authenticator app are both asked at that moment.
class ChangeStudentPinRequest(BaseModel):
    current_pin: str = Field(pattern=r"^\d{4}$")
    code: str = Field(pattern=r"^\d{6}$")
    pin: str = Field(pattern=r"^\d{4}$")
    pin_confirmation: str = Field(pattern=r"^\d{4}$")

    @model_validator(mode="after")
    def validate_pins(self) -> "ChangeStudentPinRequest":
        if self.pin != self.pin_confirmation:
            raise ValueError("Los PIN no coinciden.")
        if self.pin == self.current_pin:
            raise ValueError("El nuevo PIN no puede ser igual al que escribiste en \"PIN actual\".")
        return self


class ChangePasswordRequest(BaseModel):
    # Asked again so an open session alone (someone else at the computer, or a
    # stolen session) isn't enough to take over the account.
    current_password: str = Field(min_length=1, max_length=128)
    # A fresh code from the authenticator app, so both factors are proven
    # right when the password changes.
    code: str = Field(pattern=r"^\d{6}$")
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
        if self.password == self.current_password:
            raise ValueError("La nueva contraseña no puede ser igual a la que escribiste en \"Contraseña actual\".")
        return self


