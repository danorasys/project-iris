from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.domain.entities import CODE_SYMBOLS, ENROLLMENT_CODE_LENGTH

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


# A class code as a family types it (HU-40): spaces and lowercase don't
# matter, and it needs letters, numbers and symbols, like every code IRIS
# makes. One that can't be a code doesn't even reach the database.
def _enrollment_code(v: str) -> str:
    code = v.strip().upper()
    if len(code) < ENROLLMENT_CODE_LENGTH or len(code) > 12:
        raise ValueError("El código de la clase tiene al menos 8 caracteres.")
    if not all(c.isascii() and (c.isalnum() or c in CODE_SYMBOLS) for c in code):
        raise ValueError("El código tiene caracteres que no usa IRIS.")
    if not (any(c.isalpha() for c in code) and any(c.isdigit() for c in code) and any(c in CODE_SYMBOLS for c in code)):
        raise ValueError("El código combina letras, números y símbolos.")
    return code


EnrollmentCode = Annotated[str, Field(max_length=40), AfterValidator(_enrollment_code)]


class LookupClassroomRequest(BaseModel):
    enrollment_code: EnrollmentCode


class FamilyEnrollmentRequest(BaseModel):
    student_id: UUID
    enrollment_code: EnrollmentCode


# A message from a guardian to the teacher of their kid's class (HU-48).
class TeacherMessageRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    subject: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=2000)
    # To answer a message inside its conversation (HU-51).
    thread_id: UUID | None = None

    _clean = field_validator("subject", "body")(_no_control_chars)


# HU-77: the teacher writes to a kid of the class or to their guardian.
class FamilyMessageRequest(TeacherMessageRequest):
    recipient: Literal["student", "guardian"]


# From content-service: a new lesson (or a new extra of a published one)
# to tell the kids it's for and their guardians (HU-83). Without
# student_ids it's for everyone in the class.
class AnnouncementRequest(BaseModel):
    kind: Literal["lesson.published", "extra.published"]
    lesson_id: UUID
    lesson_title: str = Field(min_length=1, max_length=200)
    extra_title: str | None = Field(default=None, max_length=200)
    student_ids: list[UUID] | None = Field(default=None, max_length=500)


# From content-service: a kid finished the reading or the activity of a
# lesson, for their teacher (HU-69).
class StudentReportRequest(BaseModel):
    kind: Literal["lesson.content_completed", "lesson.activity_completed"]
    lesson_id: UUID
    lesson_title: str = Field(min_length=1, max_length=200)
    correct: int | None = Field(default=None, ge=0)
    total: int | None = Field(default=None, ge=0)


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
    # False once its teacher deleted their account (HU-92).
    has_teacher: bool = True


# A classroom in the teacher's own list, with its waiting requests (HU-69)
# and how many students it has.
class TeacherClassroomResponse(ClassroomResponse):
    pending_requests: int
    student_count: int


# What a family sees of a teacher (HU-97): their profile, never their
# contact or document.
class TeacherStudyOut(BaseModel):
    level: str
    title: str
    institution: str
    end_month: str | None
    in_progress: bool


class TeacherExperienceOut(BaseModel):
    role: str
    place: str
    start_month: str
    end_month: str | None
    description: str | None


class TeacherProfileOut(BaseModel):
    first_name: str
    last_name: str
    institution: str | None = None
    about: str | None
    studies: list[TeacherStudyOut]
    experiences: list[TeacherExperienceOut]


# A class found by its code, before asking to join (HU-40). Not the code
# back, nor the teacher's id.
class ClassroomPreviewResponse(BaseModel):
    classroom_id: UUID
    name: str
    description: str
    logo_file: str | None
    color: ClassroomColor
    area: ClassroomArea | None = None
    area_other: str | None = None
    grade: int | None = None
    # None when identity-service didn't answer.
    teacher: TeacherProfileOut | None
    published_lessons: int | None
    # Units with at least one published lesson. None like the lessons.
    published_units: int | None = None


# One classroom of a guardian's kid (parents' portal), with how its request
# went. No enrollment code: the family already typed it.
class FamilyClassroomResponse(BaseModel):
    enrollment_id: UUID
    student_id: UUID
    student_first_name: str
    # "pendiente" while the teacher hasn't answered, then "aceptada" or
    # "rechazada".
    status: Literal["pendiente", "aceptada", "rechazada"]
    requested_at: datetime
    resolved_at: datetime | None = None
    classroom_id: UUID
    name: str
    description: str
    # The logo can be asked with the portal open (GET /classrooms/{id}/logo/...).
    logo_file: str | None = None
    color: ClassroomColor
    area: ClassroomArea | None = None
    area_other: str | None = None
    grade: int | None = None
    # None when identity-service or content-service didn't answer.
    teacher_name: str | None
    published_lessons: int | None
    # Units with at least one published lesson. None like the lessons.
    published_units: int | None = None
    # False once its teacher deleted their account (HU-92).
    has_teacher: bool = True


# A kid's progress in the lessons of a class (HU-46, HU-47), the shape
# content-service sends. Checked here so only these fields reach the family.
class ProgressAttemptOut(BaseModel):
    correct: int
    total: int
    passed: bool
    created_at: datetime


class PartProgressOut(BaseModel):
    extra_id: UUID | None
    title: str
    # "leccion", or the kind of extra: "contenido" or "actividad".
    kind: Literal["leccion", "contenido", "actividad"]
    total_pages: int
    pages_seen: int
    has_activity: bool
    attempts: list[ProgressAttemptOut]
    percent: int = Field(ge=0, le=100)


class LessonProgressOut(BaseModel):
    lesson_id: UUID
    title: str
    unit_title: str
    main: PartProgressOut
    extras: list[PartProgressOut]


# The statistics of a class for its teacher (HU-86, HU-87), each kid with
# their name and avatar.
class KidInLessonOut(BaseModel):
    student_id: UUID
    first_name: str
    avatar_id: int
    percent: int
    tries: int
    best_correct: int | None
    best_total: int | None
    passed: bool


class LessonStatisticsOut(BaseModel):
    lesson_id: UUID
    title: str
    unit_title: str
    has_activity: bool
    average_percent: int
    completed: int
    in_progress: int
    not_started: int
    passed: int
    tried_not_passed: int
    kids: list[KidInLessonOut]


class KidInClassOut(BaseModel):
    student_id: UUID
    first_name: str
    avatar_id: int
    average_percent: int
    completed_lessons: int


class ClassStatisticsOut(BaseModel):
    kids: int
    lessons: list[LessonStatisticsOut]
    completed_percent: int
    average_percent: int
    by_kid: list[KidInClassOut]


# The space of a class the kid is in (HU-42), with its teacher (HU-97).
class FamilyClassroomDetailResponse(FamilyClassroomResponse):
    teacher: TeacherProfileOut | None


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


# From identity-service, before deleting a guardian (HU-91).
class EraseStudentsRequest(BaseModel):
    student_ids: list[UUID] = Field(max_length=100)


class EraseStudentsResponse(BaseModel):
    enrollments_deleted: int


class InternalAccessResponse(BaseModel):
    authorized: bool
