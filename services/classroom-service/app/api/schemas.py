from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Same list as CLASSROOM_COLORS in the domain and the CHECK in the database.
ClassroomColor = Literal["blue", "navy", "orange", "green", "gold"]


def _no_control_chars(v: str | None) -> str | None:
    # Line breaks are fine in a description, other control characters never.
    if v is not None and any(ord(c) < 32 and c not in "\n\t" for c in v):
        raise ValueError("El texto tiene caracteres no permitidos.")
    return v


class CreateClassroomRequest(BaseModel):
    # Spaces around are dropped before checking the length, so "   " is empty.
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=1000)
    color: ClassroomColor = "blue"

    _clean = field_validator("name", "description")(_no_control_chars)


class UpdateClassroomRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, min_length=1, max_length=1000)
    color: ClassroomColor | None = None

    _clean = field_validator("name", "description")(_no_control_chars)


class EnrollRequest(BaseModel):
    enrollment_code: str = Field(min_length=7, max_length=7)

    @field_validator("enrollment_code")
    @classmethod
    def digits_only(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("El código de ingreso debe contener solo dígitos.")
        return v


class ResolveRequestBody(BaseModel):
    decision: Literal["aceptar", "rechazar"]


class ClassroomResponse(BaseModel):
    id: UUID
    teacher_id: UUID
    name: str
    description: str
    # File name of the logo, to build GET /classrooms/{id}/logo/{logo_file}.
    # Not a URL: the logo is private and needs the user's session.
    logo_file: str | None = None
    # The avatar's color, used when there's no logo (initials on this color).
    color: ClassroomColor
    enrollment_code: str
    created_at: datetime


# A classroom in the teacher's own list, with its waiting requests (HU-69).
class TeacherClassroomResponse(ClassroomResponse):
    pending_requests: int


class EnrolledStudentResponse(BaseModel):
    enrollment_id: UUID
    student_id: UUID
    first_name: str
    avatar_id: int
    status: str
    # Their guardian (HU-75). Only the teacher of the classroom sees it.
    guardian_name: str | None
    guardian_email: str | None
    guardian_phone: str | None


class ClassroomWithStudentsResponse(ClassroomResponse):
    students: list[EnrolledStudentResponse]


class RequestResponse(BaseModel):
    enrollment_id: UUID
    student_id: UUID
    student_first_name: str
    student_avatar_id: int
    guardian_name: str
    guardian_contact: str
    requested_at: datetime


class EnrollmentResponse(BaseModel):
    enrollment_id: UUID
    classroom_id: UUID
    status: str


class ResolveResponse(BaseModel):
    enrollment_id: UUID
    status: str


class InternalAccessResponse(BaseModel):
    authorized: bool
