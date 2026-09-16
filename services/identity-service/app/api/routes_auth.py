from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from app.api.deps import CurrentUser, get_auth_service, get_current_user
from app.api.schemas import (
    GuardianRegistrationRequest,
    LoginRequest,
    RefreshRequest,
    StudentProfileLoginRequest,
    TeacherRegistrationRequest,
    TokensResponse,
)
from app.application.auth_service import AuthService
from app.application.dtos import ConsentData, FirstStudentData, GuardianData, TeacherData

router = APIRouter(prefix="/auth", tags=["auth"])

AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


def _client_ip(request: Request) -> str:
    """The gateway is the only way into this service in a real deployment, and
    it always sets X-Forwarded-For to the address it actually observed
    (app/application/proxy_service.py on api-gateway strips whatever a caller
    sent and replaces it). request.client.host is only used as a fallback,
    since it would otherwise always be the gateway's own address."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded
    return request.client.host if request.client else "unknown"


@router.post("/guardians", response_model=TokensResponse, status_code=status.HTTP_201_CREATED)
async def register_guardian(payload: GuardianRegistrationRequest, auth: AuthServiceDep) -> TokensResponse:
    _person, _guardian, _student, tokens = await auth.register_guardian(
        GuardianData(
            first_name=payload.guardian.first_name,
            last_name=payload.guardian.last_name,
            document_type_id=payload.guardian.document_type_id,
            document_number=payload.guardian.document_number,
            document_issued_at=payload.guardian.document_issued_at,
            date_of_birth=payload.guardian.date_of_birth,
            email=payload.guardian.email,
            password=payload.guardian.password,
            phone_country_code=payload.guardian.phone_country_code,
            phone_number=payload.guardian.phone_number,
            relationship_type_id=payload.guardian.relationship_type_id,
        ),
        FirstStudentData(
            first_name=payload.student.first_name,
            last_name=payload.student.last_name,
            date_of_birth=payload.student.date_of_birth,
            avatar_id=payload.student.avatar_id,
            pin=payload.student.pin,
            support_condition_id=payload.student.support_condition_id,
            support_condition_other=payload.student.support_condition_other,
            additional_support_need=payload.student.additional_support_need,
        ),
        ConsentData(
            policy_version=payload.consent.policy_version,
            accepts_data_processing=payload.consent.accepts_data_processing,
            authorizes_support_condition=payload.consent.authorizes_support_condition,
        ),
    )
    return TokensResponse(**tokens.__dict__)


@router.post("/teachers", response_model=TokensResponse, status_code=status.HTTP_201_CREATED)
async def register_teacher(payload: TeacherRegistrationRequest, auth: AuthServiceDep) -> TokensResponse:
    _person, _teacher, tokens = await auth.register_teacher(
        TeacherData(
            first_name=payload.first_name,
            last_name=payload.last_name,
            email=payload.email,
            password=payload.password,
            institution=payload.institution,
            document_type_id=payload.document_type_id,
            document_number=payload.document_number,
            date_of_birth=payload.date_of_birth,
            phone=payload.phone,
        )
    )
    return TokensResponse(**tokens.__dict__)


@router.post("/login", response_model=TokensResponse)
async def login(payload: LoginRequest, request: Request, auth: AuthServiceDep) -> TokensResponse:
    _person, _role, tokens = await auth.login(payload.email, payload.password, _client_ip(request))
    return TokensResponse(**tokens.__dict__)


@router.post("/students/profile", response_model=TokensResponse)
async def login_student_profile(payload: StudentProfileLoginRequest, auth: AuthServiceDep) -> TokensResponse:
    _student, tokens = await auth.login_student_profile(payload.student_id, payload.pin)
    return TokensResponse(**tokens.__dict__)


@router.post("/refresh", response_model=TokensResponse)
async def refresh(payload: RefreshRequest, auth: AuthServiceDep) -> TokensResponse:
    tokens = await auth.refresh(payload.refresh_token)
    return TokensResponse(**tokens.__dict__)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def logout(
    payload: RefreshRequest,
    auth: AuthServiceDep,
    _user: Annotated[CurrentUser, Depends(get_current_user)],
) -> None:
    await auth.logout(payload.refresh_token)
