# Application-layer input/output DTOs, independent of Pydantic so application/
# doesn't depend on FastAPI. The api/ layer maps its Pydantic schemas to and
# from these dataclasses.

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from app.domain.entities import Classroom, Enrollment


@dataclass
class UpdateClassroomData:
    name: str | None = None
    description: str | None = None
    color: str | None = None
    area: str | None = None
    area_other: str | None = None
    grade: int | None = None


# A classroom in the teacher's list, with how many requests wait for them
# and how many students it already has.
@dataclass
class TeacherClassroom:
    classroom: Classroom
    pending_requests: int
    student_count: int


# One classroom of a guardian's kid, for the parents' portal: the kid, how
# the request is going, who teaches it and how many lessons it already has.
# teacher_name and published_lessons are None when that service didn't answer.
@dataclass
class FamilyClassroom:
    student_id: UUID
    student_first_name: str
    enrollment_id: UUID
    status: str
    requested_at: datetime
    classroom: Classroom
    teacher_name: str | None
    published_lessons: int | None


@dataclass
class EnrolledStudent:
    enrollment_id: UUID
    student_id: UUID
    first_name: str
    avatar_id: int
    status: str
    # Their guardian, so the teacher knows who to talk to (HU-75). None when
    # identity-service doesn't have the kid anymore.
    guardian_name: str | None = None
    guardian_email: str | None = None
    guardian_phone: str | None = None


@dataclass
class ClassroomWithStudents:
    classroom: Classroom
    students: list[EnrolledStudent]


@dataclass
class EnrichedRequest:
    enrollment_id: UUID
    student_id: UUID
    student_first_name: str
    student_avatar_id: int
    guardian_name: str
    guardian_contact: str
    requested_at: datetime


@dataclass
class EnrollmentResult:
    enrollment: Enrollment


@dataclass
class ResolutionResult:
    enrollment: Enrollment
