from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.api.deps import CurrentUser, get_guardian_service, get_totp_service, require_role
from app.api.schemas import (
    ChangePasswordRequest,
    ConfirmPasswordRequest,
    CreateAdditionalStudentRequest,
    GuardianProfileResponse,
    StudentProfileResponse,
    TotpSetupResponse,
    TotpVerifyRequest,
    UpdateGuardianProfileRequest,
)
from app.application.dtos import FirstStudentData, UpdateGuardianProfileData
from app.application.guardian_service import GuardianService
from app.application.totp_service import TotpService
from app.domain.entities import Guardian, Person

router = APIRouter(prefix="/guardians", tags=["guardians"])

GuardianServiceDep = Annotated[GuardianService, Depends(get_guardian_service)]
TotpServiceDep = Annotated[TotpService, Depends(get_totp_service)]
CurrentGuardianDep = Annotated[CurrentUser, Depends(require_role("guardian"))]


def _to_profile_response(person: Person, guardian: Guardian) -> GuardianProfileResponse:
    # document_issued_at is optional on Person in general (a teacher's row
    # never sets it), but always present for a guardian — GuardianDataRequest
    # requires it at registration and nothing here ever clears it.
    assert person.document_issued_at is not None
    return GuardianProfileResponse(
        first_name=person.first_name,
        last_name=person.last_name,
        date_of_birth=person.date_of_birth,
        document_type_id=person.document_type_id,
        document_number=person.document_number,
        document_issued_at=person.document_issued_at,
        email=person.email,
        phone_country_code=person.phone_country_code,
        phone_number=person.phone_number,
        relationship_type_id=guardian.relationship_type_id,
    )


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
            avatar_id=payload.avatar_id,
            pin=payload.pin,
            support_condition_id=payload.support_condition_id,
            support_condition_other=payload.support_condition_other,
            additional_support_need=payload.additional_support_need,
        ),
    )
    return StudentProfileResponse(**student.__dict__)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_my_account(user: CurrentGuardianDep, guardians: GuardianServiceDep) -> None:
    """Right to erasure."""
    await guardians.delete_account(user.subject_id)


@router.post("/me/confirm-password", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def confirm_my_password(
    payload: ConfirmPasswordRequest, user: CurrentGuardianDep, guardians: GuardianServiceDep
) -> None:
    """Checked right before entering the parents' portal, so a session left
    open on a shared computer can't be used to reach it."""
    await guardians.confirm_password(user.subject_id, payload.password)


@router.get("/me", response_model=GuardianProfileResponse)
async def get_my_profile(user: CurrentGuardianDep, guardians: GuardianServiceDep) -> GuardianProfileResponse:
    person, guardian = await guardians.get_profile(user.subject_id)
    return _to_profile_response(person, guardian)


@router.patch("/me", response_model=GuardianProfileResponse)
async def update_my_profile(
    payload: UpdateGuardianProfileRequest, user: CurrentGuardianDep, guardians: GuardianServiceDep
) -> GuardianProfileResponse:
    """Only the fields on UpdateGuardianProfileRequest can change. Document
    type, document number, email and the document issue date are never
    accepted here, so a guardian has no way to change what identifies
    their own account or document."""
    person, guardian = await guardians.update_profile(
        user.subject_id,
        UpdateGuardianProfileData(
            first_name=payload.first_name,
            last_name=payload.last_name,
            date_of_birth=payload.date_of_birth,
            phone_country_code=payload.phone_country_code,
            phone_number=payload.phone_number,
            relationship_type_id=payload.relationship_type_id,
        ),
    )
    return _to_profile_response(person, guardian)


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def change_my_password(
    payload: ChangePasswordRequest, user: CurrentGuardianDep, guardians: GuardianServiceDep
) -> None:
    """There's no current-password field here on purpose — see the
    docstring on GuardianService.change_password for why."""
    await guardians.change_password(user.subject_id, payload.password)


@router.post("/me/2fa/setup", response_model=TotpSetupResponse)
async def setup_totp(user: CurrentGuardianDep, totp: TotpServiceDep) -> TotpSetupResponse:
    """Generates a new TOTP secret and its QR code. Doesn't enable 2FA by
    itself — see /me/2fa/verify, which is what actually turns it on."""
    result = await totp.setup(user.subject_id)
    return TotpSetupResponse(qr_code_data_uri=result.qr_code_data_uri, manual_entry_key=result.manual_entry_key)


@router.post("/me/2fa/verify", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def verify_totp(payload: TotpVerifyRequest, user: CurrentGuardianDep, totp: TotpServiceDep) -> None:
    """Confirms the guardian's authenticator app is actually producing valid
    codes for the secret from /me/2fa/setup, and only then turns 2FA on."""
    await totp.verify(user.subject_id, payload.code)
