from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import JSONResponse

from app.api.deps import CurrentUser, get_auth_service, require_role
from app.api.schemas import (
    AccessTokenResponse,
    GuardianRegistrationRequest,
    LoginRequest,
    StudentProfileLoginRequest,
    TeacherRegistrationRequest,
)
from app.api.session_cookie import clear_refresh_cookie, read_refresh_cookie, require_client_header, set_refresh_cookie
from app.application.auth_service import AuthService
from app.application.dtos import ConsentData, FirstStudentData, GuardianData, IssuedTokens, TeacherData
from app.domain.exceptions import DomainError, InvalidToken, RefreshTokenJustUsed
from app.errors import domain_error_response

router = APIRouter(prefix="/auth", tags=["auth"])

AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]
# Every route that sets or reads the session cookie asks for the app's header.
ClientHeaderDep = Depends(require_client_header)


def _start_session(response: Response, tokens: IssuedTokens) -> AccessTokenResponse:
    set_refresh_cookie(response, tokens.refresh_token)
    return AccessTokenResponse(access_token=tokens.access_token, token_type=tokens.token_type)


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


@router.post(
    "/guardians", response_model=AccessTokenResponse, status_code=status.HTTP_201_CREATED, dependencies=[ClientHeaderDep]
)
async def register_guardian(
    payload: GuardianRegistrationRequest, response: Response, auth: AuthServiceDep
) -> AccessTokenResponse:
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
    return _start_session(response, tokens)


@router.post(
    "/teachers", response_model=AccessTokenResponse, status_code=status.HTTP_201_CREATED, dependencies=[ClientHeaderDep]
)
async def register_teacher(
    payload: TeacherRegistrationRequest, response: Response, auth: AuthServiceDep
) -> AccessTokenResponse:
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
    return _start_session(response, tokens)


@router.post("/login", response_model=AccessTokenResponse, dependencies=[ClientHeaderDep])
async def login(payload: LoginRequest, request: Request, response: Response, auth: AuthServiceDep) -> AccessTokenResponse:
    _person, _role, tokens = await auth.login(payload.email, payload.password, _client_ip(request))
    return _start_session(response, tokens)


@router.post("/students/profile", response_model=AccessTokenResponse, dependencies=[ClientHeaderDep])
async def login_student_profile(
    payload: StudentProfileLoginRequest, response: Response, auth: AuthServiceDep
) -> AccessTokenResponse:
    _student, tokens = await auth.login_student_profile(payload.student_id, payload.pin)
    return _start_session(response, tokens)


@router.post("/refresh", response_model=AccessTokenResponse, dependencies=[ClientHeaderDep])
async def refresh(request: Request, response: Response, auth: AuthServiceDep) -> AccessTokenResponse | JSONResponse:
    """Gives a new access token with the refresh token of the cookie, and
    rotates the cookie. If it doesn't work anymore, the cookie is deleted."""
    refresh_token = read_refresh_cookie(request)
    try:
        if refresh_token is None:
            raise InvalidToken()
        tokens = await auth.refresh(refresh_token)
    except DomainError as exc:
        error = domain_error_response(exc)
        # When another tab just used it, the browser already holds the new
        # cookie. Deleting it here would close the session of both tabs.
        if not isinstance(exc, RefreshTokenJustUsed):
            clear_refresh_cookie(error)
        return error
    return _start_session(response, tokens)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_model=None, dependencies=[ClientHeaderDep])
async def logout(request: Request, response: Response, auth: AuthServiceDep) -> None:
    """Closes the session of the cookie and deletes it. It doesn't ask for
    the access token: JavaScript can't delete an HttpOnly cookie, so this has
    to work even if the access token expired, or the session would come back
    on the next page load."""
    refresh_token = read_refresh_cookie(request)
    if refresh_token:
        await auth.logout(refresh_token)
    clear_refresh_cookie(response)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT, response_model=None, dependencies=[ClientHeaderDep])
async def logout_all(
    response: Response,
    auth: AuthServiceDep,
    user: Annotated[CurrentUser, Depends(require_role("guardian", "teacher"))],
) -> None:
    """Closes every session of this account, this one included."""
    await auth.logout_all(user.subject_id)
    clear_refresh_cookie(response)
