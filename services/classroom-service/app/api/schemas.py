from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Same list as CLASSROOM_COLORS in the domain and the CHECK in the database.
ClassroomColor = Literal["blue", "navy", "orange", "green", "gold"]

# Same lists as CLASSROOM_AREAS and CLASSROOM_GRADES in the domain: the nine
# areas of Ley 115 (art. 23) plus "other", and first to fifth grade.
ClassroomArea = Literal[
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
]
ClassroomGrade = Annotated[int, Field(ge=1, le=5)]


def _no_control_chars(v: str | None) -> str | None:
    # Line breaks are fine in a description, other control characters never.
    if v is not None and any(ord(c) < 32 and c not in "\n\t" for c in v):
        raise ValueError("El texto tiene caracteres no permitidos.")
    return v


class CreateClassroomRequest(BaseModel):
    # Spaces around are dropped before checking the length, so "   " is empty.
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=2000)
    color: ClassroomColor = "blue"
    area: ClassroomArea
    # Which area it is, only with area "other" (and then required).
    area_other: str | None = Field(default=None, min_length=1, max_length=60)
    grade: ClassroomGrade

    _clean = field_validator("name", "description", "area_other")(_no_control_chars)


class UpdateClassroomRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, min_length=1, max_length=2000)
    color: ClassroomColor | None = None
    # Leaving them out keeps them. They can't be cleared, so null is refused.
    area: ClassroomArea | None = None
    area_other: str | None = Field(default=None, min_length=1, max_length=60)
    grade: ClassroomGrade | None = None

    _clean = field_validator("name", "description", "area_other")(_no_control_chars)

    @model_validator(mode="after")
    def area_and_grade_not_null(self) -> UpdateClassroomRequest:
        for field in ("area", "grade"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError("El área y el grado de la clase son obligatorios.")
        return self


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
    # What it's about and who it's for (see ClassroomArea). Empty only in
    # classrooms created before they were required.
    area: ClassroomArea | None = None
    area_other: str | None = None
    grade: int | None = None
    enrollment_code: str
    created_at: datetime


# A classroom in the teacher's own list, with its waiting requests (HU-69)
# and how many students it has.
class TeacherClassroomResponse(ClassroomResponse):
    pending_requests: int
    student_count: int


# One classroom of a guardian's kid (parents' portal). No enrollment code
# and no logo: the logo is private to the classroom, so the portal shows
# the initials on the classroom's color.
class FamilyClassroomResponse(BaseModel):
    enrollment_id: UUID
    student_id: UUID
    student_first_name: str
    # "pendiente" while the teacher hasn't answered, "aceptada" once in.
    status: Literal["pendiente", "aceptada"]
    requested_at: datetime
    classroom_id: UUID
    name: str
    description: str
    color: ClassroomColor
    area: ClassroomArea | None = None
    area_other: str | None = None
    grade: int | None = None
    # None when identity-service or content-service didn't answer.
    teacher_name: str | None
    published_lessons: int | None


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
