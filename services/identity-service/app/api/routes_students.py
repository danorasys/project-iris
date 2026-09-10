from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, get_student_service, require_role
from app.api.schemas import StudentProfileResponse, UpdateStudentAvatarRequest
from app.application.student_service import StudentService

router = APIRouter(prefix="/students", tags=["students"])

StudentServiceDep = Annotated[StudentService, Depends(get_student_service)]
CurrentStudentDep = Annotated[CurrentUser, Depends(require_role("student"))]


@router.patch("/me/avatar", response_model=StudentProfileResponse)
async def update_my_avatar(
    payload: UpdateStudentAvatarRequest,
    user: CurrentStudentDep,
    students: StudentServiceDep,
) -> StudentProfileResponse:
    """A student picks their own avatar by gaze, right after calibrating.
    `user.subject_id` is the student's own id here, never a client-supplied
    one, so there's no way to target another profile."""
    student = await students.update_avatar(user.subject_id, payload.avatar)
    return StudentProfileResponse(**student.__dict__)
