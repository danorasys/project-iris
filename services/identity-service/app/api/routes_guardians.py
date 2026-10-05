from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.deps import CurrentUser, get_guardian_service, get_totp_service, require_portal_access, require_role
from app.api.schemas import (
    ChangePasswordRequest,
    ChangeStudentPinRequest,
    CheckStudentPinRequest,
    CreateAdditionalStudentRequest,
    GuardianProfileResponse,
    PortalChallengeResponse,
    StudentDetailResponse,
    StudentProfileResponse,
    TotpSetupResponse,
    TotpVerifyRequest,
    UpdateGuardianProfileRequest,
    UpdateStudentRequest,
)
from app.application.dtos import FirstStudentData, UpdateGuardianProfileData, UpdateStudentData
from app.application.guardian_service import GuardianService
from app.application.totp_service import TotpService
from app.domain.entities import Guardian, Person, Student
from app.domain.exceptions import DomainError

router = APIRouter(prefix="/guardians", tags=["guardians"])

GuardianServiceDep = Annotated[GuardianService, Depends(get_guardian_service)]
TotpServiceDep = Annotated[TotpService, Depends(get_totp_service)]
CurrentGuardianDep = Annotated[CurrentUser, Depends(require_role("guardian"))]
# For everything inside the parents' portal. Listing the children stays open, the
# profile picker of the kids' portal needs it without the 2FA code.
PortalAccessDep = Depends(require_portal_access)


def _to_student_profile(student: Student) -> StudentProfileResponse:
    return StudentProfileResponse(
        id=student.id, first_name=student.first_name, avatar_id=student.avatar_id, date_of_birth=student.date_of_birth
    )


def _to_student_detail(student: Student) -> StudentDetailResponse:
    return StudentDetailResponse(
        id=student.id,
        first_name=student.first_name,
        last_name=student.last_name,
        date_of_birth=student.date_of_birth,
        avatar_id=student.avatar_id,
        support_condition_ids=student.support_condition_ids,
        support_condition_other=student.support_condition_other,
        additional_support_need=student.additional_support_need,
    )


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
    return [_to_student_profile(s) for s in students]


@router.post(
    "/me/students",
    response_model=StudentProfileResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[PortalAccessDep],
)
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
            support_condition_ids=payload.support_condition_ids,
            support_condition_other=payload.support_condition_other,
            additional_support_need=payload.additional_support_need,
        ),
    )
    return _to_student_profile(student)


@router.get("/me/students/{student_id}", response_model=StudentDetailResponse, dependencies=[PortalAccessDep])
async def get_my_student(
    student_id: UUID, user: CurrentGuardianDep, guardians: GuardianServiceDep
) -> StudentDetailResponse:
    """All the data of one of the guardian's kids. Unlike the list, this one
    needs the portal's 2FA code, because it includes the support condition."""
    return _to_student_detail(await guardians.get_student(user.subject_id, student_id))


@router.patch("/me/students/{student_id}", response_model=StudentDetailResponse, dependencies=[PortalAccessDep])
async def update_my_student(
    student_id: UUID,
    payload: UpdateStudentRequest,
    user: CurrentGuardianDep,
    guardians: GuardianServiceDep,
) -> StudentDetailResponse:
    """Changes the data of one of the guardian's kids, the avatar included.
    The PIN has its own route. truthful_declaration must be true, and each
    save that changes something is recorded with the names of the fields."""
    student = await guardians.update_student(
        user.subject_id,
        student_id,
        UpdateStudentData(
            first_name=payload.first_name,
            last_name=payload.last_name,
            date_of_birth=payload.date_of_birth,
            avatar_id=payload.avatar_id,
            support_condition_ids=payload.support_condition_ids,
            support_condition_other=payload.support_condition_other,
            additional_support_need=payload.additional_support_need,
        ),
        session_id=user.session_id,
    )
    return _to_student_detail(student)


@router.post(
    "/me/students/{student_id}/pin/check",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    dependencies=[PortalAccessDep],
)
async def check_my_student_pin(
    student_id: UUID, payload: CheckStudentPinRequest, user: CurrentGuardianDep, guardians: GuardianServiceDep
) -> None:
    """204 if that is the kid's current PIN, 422 if not. Changes nothing: it
    lets the portal say a wrong PIN at once, before asking for the new one.
    Wrong tries are counted and lock like in the change itself."""
    await guardians.check_student_pin(user.subject_id, student_id, payload.current_pin)


@router.put("/me/students/{student_id}/pin", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def change_my_student_pin(
    student_id: UUID,
    payload: ChangeStudentPinRequest,
    user: CurrentGuardianDep,
    guardians: GuardianServiceDep,
    totp: TotpServiceDep,
) -> None:
    """Sets a new PIN for one of the guardian's kids. Like the password
    change, it asks for a fresh 2FA code and the current PIN at the same
    moment, so it doesn't lean on the portal access from earlier. If the
    code was right but the rest failed, the code can be used again. The
    kid's open sessions are closed."""
    await totp.confirm_sensitive_action(user.subject_id, user.session_id, payload.code)
    try:
        await guardians.change_student_pin(user.subject_id, student_id, payload.current_pin, payload.pin)
    except DomainError:
        await totp.release_code(user.subject_id, payload.code)
        raise


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT, response_model=None, dependencies=[PortalAccessDep])
async def delete_my_account(user: CurrentGuardianDep, guardians: GuardianServiceDep) -> None:
    """Right to erasure."""
    await guardians.delete_account(user.subject_id)


@router.get("/me", response_model=GuardianProfileResponse, dependencies=[PortalAccessDep])
async def get_my_profile(user: CurrentGuardianDep, guardians: GuardianServiceDep) -> GuardianProfileResponse:
    person, guardian = await guardians.get_profile(user.subject_id)
    return _to_profile_response(person, guardian)


@router.patch("/me", response_model=GuardianProfileResponse, dependencies=[PortalAccessDep])
async def update_my_profile(
    payload: UpdateGuardianProfileRequest, user: CurrentGuardianDep, guardians: GuardianServiceDep
) -> GuardianProfileResponse:
    """Changes only the fields of UpdateGuardianProfileRequest, never the
    document or the email. Needs the truthful declaration, and each save that
    changes something records the names of those fields (never the values)."""
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
        session_id=user.session_id,
    )
    return _to_profile_response(person, guardian)


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def change_my_password(
    payload: ChangePasswordRequest, user: CurrentGuardianDep, guardians: GuardianServiceDep, totp: TotpServiceDep
) -> None:
    """Asks for a fresh 2FA code and the current password, both factors at
    the same moment, so it doesn't lean on the portal access from earlier.
    Wrong codes lock like the portal's, wrong passwords lock like the login.
    If the code was right but the rest failed, the code can be used again."""
    await totp.confirm_sensitive_action(user.subject_id, user.session_id, payload.code)
    try:
        await guardians.change_password(user.subject_id, payload.current_password, payload.password)
    except DomainError:
        await totp.release_code(user.subject_id, payload.code)
        raise


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
    await totp.verify(user.subject_id, user.session_id, payload.code, role="guardian")


@router.post("/me/2fa/challenge", response_model=PortalChallengeResponse)
async def confirm_portal_access(
    payload: TotpVerifyRequest, user: CurrentGuardianDep, totp: TotpServiceDep
) -> PortalChallengeResponse:
    """Asked before entering the parents' portal: checks a fresh code from
    the guardian's authenticator app. Needs 2FA to be already enabled. Says
    how many wrong attempts there were since the last entry."""
    missed = await totp.confirm_portal_access(user.subject_id, user.session_id, payload.code)
    return PortalChallengeResponse(failed_attempts_before=missed)


@router.get("/me/portal-access", status_code=status.HTTP_204_NO_CONTENT, response_model=None, dependencies=[PortalAccessDep])
async def check_portal_access() -> None:
    """204 if this session passed the 2FA check and has been active lately,
    403 if not. The frontend asks this before showing the portal."""
