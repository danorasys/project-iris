from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class CreateClassroomRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=1000)


class UpdateClassroomRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, min_length=1, max_length=1000)


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
    logo_url: str | None = None
    enrollment_code: str
    created_at: datetime


class EnrolledStudentResponse(BaseModel):
    enrollment_id: UUID
    student_id: UUID
    first_name: str
    avatar_id: int
    status: str


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
