"""Application-layer input/output DTOs, independent of Pydantic so application/
doesn't depend on FastAPI. The api/ layer maps its Pydantic schemas to and
from these dataclasses."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from app.domain.entities import Classroom, Enrollment


@dataclass
class UpdateClassroomData:
    name: str | None = None
    description: str | None = None


@dataclass
class EnrolledStudent:
    enrollment_id: UUID
    student_id: UUID
    first_name: str
    avatar: str
    status: str


@dataclass
class ClassroomWithStudents:
    classroom: Classroom
    students: list[EnrolledStudent]


@dataclass
class EnrichedRequest:
    enrollment_id: UUID
    student_id: UUID
    student_first_name: str
    student_avatar: str
    guardian_name: str
    guardian_contact: str
    requested_at: datetime


@dataclass
class EnrollmentResult:
    enrollment: Enrollment


@dataclass
class ResolutionResult:
    enrollment: Enrollment
