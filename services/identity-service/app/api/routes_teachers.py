"""Routes of the signed-in teacher about their own account: their profile and
their 2FA. Everything except the 2FA itself needs a session that already
passed the code (require_verified_teacher)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.api.deps import (
    CurrentUser,
    get_account_erasure_service,
    get_auth_service,
    get_password_change_service,
    get_teacher_profile_service,
    get_totp_service,
    require_role,
    require_verified_teacher,
)
from app.api.schemas import (
    AccessTokenResponse,
    ChangePasswordRequest,
    DeleteAccountRequest,
    TeacherAccountResponse,
    TeacherProfileResponse,
    TotpSetupResponse,
    TotpStatusResponse,
    TotpVerifyRequest,
    UpdateTeacherAccountRequest,
    UpdateTeacherProfileRequest,
)
from app.application.account_erasure import AccountErasureService
from app.application.auth_service import AuthService
from app.application.dtos import UpdateTeacherAccountData
from app.application.password_change import PasswordChangeService
from app.application.teacher_profile import TeacherProfileService
from app.application.totp_service import TotpService
from app.domain.entities import Person, Teacher
from app.domain.exceptions import DomainError, InvalidToken

router = APIRouter(prefix="/teachers", tags=["teachers"])

CurrentTeacherDep = Annotated[CurrentUser, Depends(require_role("teacher"))]
VerifiedTeacherDep = Annotated[CurrentUser, Depends(require_verified_teacher)]
ProfileServiceDep = Annotated[TeacherProfileService, Depends(get_teacher_profile_service)]
TotpServiceDep = Annotated[TotpService, Depends(get_totp_service)]
AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]
PasswordChangeDep = Annotated[PasswordChangeService, Depends(get_password_change_service)]


def _verified_token(auth: AuthService, user: CurrentUser) -> AccessTokenResponse:
    if user.session_id is None:
        raise InvalidToken()
    return AccessTokenResponse(access_token=auth.issue_verified_access_token(user.subject_id, user.session_id))


@router.get("/me/2fa", response_model=TotpStatusResponse)
async def read_my_2fa(user: CurrentTeacherDep, totp: TotpServiceDep) -> TotpStatusResponse:
    """Whether the teacher already turned 2FA on, so the web app knows if it
    has to show the setup or ask for the code."""
    return TotpStatusResponse(enabled=await totp.is_enabled(user.subject_id))


@router.post("/me/2fa/setup", response_model=TotpSetupResponse)
async def setup_my_2fa(user: CurrentTeacherDep, totp: TotpServiceDep) -> TotpSetupResponse:
    """A new secret and its QR code. It doesn't turn 2FA on by itself, see
    /me/2fa/verify."""
    result = await totp.setup(user.subject_id)
    return TotpSetupResponse(qr_code_data_uri=result.qr_code_data_uri, manual_entry_key=result.manual_entry_key)


@router.post("/me/2fa/verify", response_model=AccessTokenResponse)
async def verify_my_2fa(
    payload: TotpVerifyRequest, user: CurrentTeacherDep, totp: TotpServiceDep, auth: AuthServiceDep
) -> AccessTokenResponse:
    """Turns 2FA on with the first good code from the app. That code also
    verifies this session, so it comes back with an access token that opens
    the panel."""
    await totp.verify(user.subject_id, user.session_id, payload.code, role="teacher")
    return _verified_token(auth, user)


@router.post("/me/2fa/challenge", response_model=AccessTokenResponse)
async def confirm_my_session(
    payload: TotpVerifyRequest, user: CurrentTeacherDep, totp: TotpServiceDep, auth: AuthServiceDep
) -> AccessTokenResponse:
    """The code asked when the teacher opens their panel in a new session.
    Wrong codes lock like the parents' portal."""
    await totp.confirm_teacher_session(user.subject_id, user.session_id, payload.code)
    return _verified_token(auth, user)


@router.get("/me", response_model=TeacherAccountResponse)
async def read_my_account(user: VerifiedTeacherDep, profiles: ProfileServiceDep) -> TeacherAccountResponse:
    """The teacher's own account data: name, document, contact and
    institution. Never the password or the 2FA secret."""
    person, teacher = await profiles.get_my_account(user.subject_id)
    return _to_account_response(person, teacher)


@router.patch("/me", response_model=TeacherAccountResponse)
async def update_my_account(
    payload: UpdateTeacherAccountRequest, user: VerifiedTeacherDep, profiles: ProfileServiceDep
) -> TeacherAccountResponse:
    """Changes names, birth date, phone and institution, never the document
    or the email. Needs the truthful declaration, and each save that changes
    something records the names of those fields (never the values)."""
    person, teacher = await profiles.update_my_account(
        user.subject_id,
        UpdateTeacherAccountData(
            first_name=payload.first_name,
            last_name=payload.last_name,
            date_of_birth=payload.date_of_birth,
            phone_country_code=payload.phone_country_code,
            phone_number=payload.phone_number,
            institution=payload.institution,
        ),
        session_id=user.session_id,
    )
    return _to_account_response(person, teacher)


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def change_my_password(
    payload: ChangePasswordRequest, user: VerifiedTeacherDep, passwords: PasswordChangeDep, totp: TotpServiceDep
) -> None:
    """Same as the guardian's: a fresh 2FA code and the current password.
    Closes every session of the account. If the code was right but the rest
    failed, the code can be used again."""
    await totp.confirm_sensitive_action(user.subject_id, user.session_id, payload.code)
    try:
        await passwords.change_password(user.subject_id, payload.current_password, payload.password)
    except DomainError:
        await totp.release_code(user.subject_id, payload.code)
        raise


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_my_account(
    payload: DeleteAccountRequest,
    user: VerifiedTeacherDep,
    erasure: Annotated[AccountErasureService, Depends(get_account_erasure_service)],
) -> None:
    """Right to erasure (HU-92): the teacher's personal data goes; their
    classes, lessons and the kids in them stay, without a teacher. Asks for
    the password again. 503 borrado_no_disponible if another service didn't
    answer: then nothing is deleted here."""
    await erasure.delete_teacher(user.subject_id, payload.password)


@router.get("/me/profile", response_model=TeacherProfileResponse)
async def read_my_profile(user: VerifiedTeacherDep, profiles: ProfileServiceDep) -> TeacherProfileResponse:
    """The teacher's profile: about me, studies and experience. Empty lists
    and nulls when they haven't filled it in yet."""
    profile = await profiles.get_my_profile(user.subject_id)
    return TeacherProfileResponse.from_entity(profile)


@router.put("/me/profile", response_model=TeacherProfileResponse)
async def replace_my_profile(
    payload: UpdateTeacherProfileRequest, user: VerifiedTeacherDep, profiles: ProfileServiceDep
) -> TeacherProfileResponse:
    """Replaces the whole profile (an entry not sent is deleted). Needs the
    truthful declaration, and records which parts changed (about, studies,
    experiences), never their content."""
    profile = await profiles.update_my_profile(user.subject_id, payload.to_entity(), session_id=user.session_id)
    return TeacherProfileResponse.from_entity(profile)


def _to_account_response(person: Person, teacher: Teacher) -> TeacherAccountResponse:
    return TeacherAccountResponse(
        first_name=person.first_name,
        last_name=person.last_name,
        date_of_birth=person.date_of_birth,
        document_type_id=person.document_type_id,
        document_number=person.document_number,
        document_issued_at=person.document_issued_at,
        email=person.email,
        phone_country_code=person.phone_country_code,
        phone_number=person.phone_number,
        institution=teacher.institution,
    )
