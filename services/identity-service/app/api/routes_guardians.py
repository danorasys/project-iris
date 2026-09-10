from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.api.deps import CurrentUser, get_guardian_service, require_role
from app.api.schemas import CreateAdditionalStudentRequest, StudentProfileResponse
from app.application.dtos import FirstStudentData
from app.application.guardian_service import GuardianService

router = APIRouter(prefix="/guardians", tags=["guardians"])

GuardianServiceDep = Annotated[GuardianService, Depends(get_guardian_service)]
CurrentGuardianDep = Annotated[CurrentUser, Depends(require_role("guardian"))]


@router.get("/me/students", response_model=list[StudentProfileResponse])
async def list_my_students(user: CurrentGuardianDep, guardians: GuardianServiceDep) -> list[StudentProfileResponse]:
    students = await guardians.list_students(user.subject_id)
    return [StudentProfileResponse(**s.__dict__) for s in students]


@router.post("/me/students", response_model=StudentProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_additional_student(
    payload: CreateAdditionalStudentRequest,
    user: CurrentGuardianDep,
    guardians: GuardianServiceDep,
) -> StudentProfileResponse:
    student = await guardians.create_student(
        user.subject_id,
        FirstStudentData(
            first_name=payload.first_name,
            last_name=payload.last_name,
            date_of_birth=payload.date_of_birth,
            avatar=payload.avatar,
            pin=payload.pin,
            support_condition=payload.support_condition,
        ),
    )
    return StudentProfileResponse(**student.__dict__)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_my_account(user: CurrentGuardianDep, guardians: GuardianServiceDep) -> None:
    """Right to erasure."""
    await guardians.delete_account(user.subject_id)
