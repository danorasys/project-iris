"""Internal endpoints for content-service: checking authorization on a
classroom without duplicating the owner/enrollment logic, and telling the
class about new lessons and the teacher about what the kids finish.
Protected by X-Internal-Key on top of network isolation.

Always responds 200 with {"authorized": true|false}. The caller decides
whether to deny, never this endpoint. 404 only if the classroom doesn't exist."""

from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.deps import get_classroom_service, verify_internal_key
from app.api.schemas import (
    AnnouncementRequest,
    EraseStudentsRequest,
    EraseStudentsResponse,
    InternalAccessResponse,
    StudentReportRequest,
)
from app.application.classroom_service import ClassroomService

router = APIRouter(prefix="/internal", tags=["internal"])


@router.get(
    "/classrooms/{classroom_id}/access",
    response_model=InternalAccessResponse,
    dependencies=[Depends(verify_internal_key)],
)
async def verify_access(
    classroom_id: UUID,
    subject_id: UUID,
    role: Literal["teacher", "student"],
    classrooms: Annotated[ClassroomService, Depends(get_classroom_service)],
) -> InternalAccessResponse:
    authorized = await classrooms.verify_access(classroom_id, subject_id, role)
    return InternalAccessResponse(authorized=authorized)


@router.post(
    "/classrooms/{classroom_id}/announcements",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    dependencies=[Depends(verify_internal_key)],
)
async def announce(
    classroom_id: UUID,
    payload: AnnouncementRequest,
    classrooms: Annotated[ClassroomService, Depends(get_classroom_service)],
) -> None:
    """A new lesson, or a new extra of a published one (HU-83): its kids and
    their guardians get a notification."""
    await classrooms.announce(
        classroom_id, payload.kind, payload.lesson_id, payload.lesson_title, payload.extra_title, payload.student_ids
    )


@router.post(
    "/classrooms/{classroom_id}/students/{student_id}/reports",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    dependencies=[Depends(verify_internal_key)],
)
async def report_student(
    classroom_id: UUID,
    student_id: UUID,
    payload: StudentReportRequest,
    classrooms: Annotated[ClassroomService, Depends(get_classroom_service)],
) -> None:
    """A kid finished the reading or the activity of a lesson (HU-69): their
    teacher gets a notification."""
    await classrooms.report_student(
        classroom_id, student_id, payload.kind, payload.lesson_id, payload.lesson_title, payload.correct, payload.total
    )


@router.post(
    "/erasures/students", response_model=EraseStudentsResponse, dependencies=[Depends(verify_internal_key)]
)
async def erase_students(
    payload: EraseStudentsRequest, classrooms: Annotated[ClassroomService, Depends(get_classroom_service)]
) -> EraseStudentsResponse:
    """identity-service asks this before deleting a guardian (HU-91): every
    enrollment of their kids goes. Asking again finds none."""
    deleted = await classrooms.erase_students(list(dict.fromkeys(payload.student_ids)))
    return EraseStudentsResponse(enrollments_deleted=deleted)


@router.post(
    "/erasures/teachers/{teacher_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    dependencies=[Depends(verify_internal_key)],
)
async def teacher_left(teacher_id: UUID, classrooms: Annotated[ClassroomService, Depends(get_classroom_service)]) -> None:
    """identity-service asks this before deleting a teacher (HU-92): their
    classes stay for their kids, without a teacher, and the requests still
    waiting are closed."""
    await classrooms.teacher_left(teacher_id)
