"""Internal endpoints for the other services: validate a JWT without
duplicating the verification logic, and the few facts about people they
need. Protected by X-Internal-Key on top of network isolation, a private
network or mTLS in production."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.api.deps import get_auth_service, get_internal_query_service, get_portal_access_store, verify_internal_key
from app.api.schemas import (
    GuardianStudentResponse,
    PortalAccessCheckRequest,
    StudentWithGuardianResponse,
    TeacherNameResponse,
    TeacherProfileResponse,
    TeacherPublicProfileResponse,
    TokenClaimsResponse,
)
from app.application.auth_service import AuthService
from app.application.internal_service import InternalQueryService
from app.config import get_settings
from app.domain.exceptions import InvalidToken, PortalAccessRequired
from app.infrastructure.redis_gateway import RedisPortalAccessStore

router = APIRouter(prefix="/internal", tags=["internal"])
_bearer = HTTPBearer(auto_error=False)


@router.get("/tokens/validate", response_model=TokenClaimsResponse, dependencies=[Depends(verify_internal_key)])
async def validate_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    auth: Annotated[AuthService, Depends(get_auth_service)],
    renew: bool = True,
) -> TokenClaimsResponse:
    """renew=false for the requests the page makes by itself: they don't
    keep a teacher's panel open."""
    if credentials is None:
        raise InvalidToken("Falta el token a validar.")
    claims = await auth.validate_access_token(credentials.credentials, renew)
    extra = {k: str(v) for k, v in claims.items() if k not in {"sub", "role", "type", "iat", "exp"}}
    return TokenClaimsResponse(sub=str(claims["sub"]), role=str(claims["role"]), extra=extra)


@router.get(
    "/students/{student_id}",
    response_model=StudentWithGuardianResponse,
    dependencies=[Depends(verify_internal_key)],
)
async def get_student_with_guardian(
    student_id: UUID,
    queries: Annotated[InternalQueryService, Depends(get_internal_query_service)],
) -> StudentWithGuardianResponse:
    """Used by classroom-service to show the teacher, alongside each pending
    enrollment request, who the student is and how to reach their guardian."""
    data = await queries.get_student_with_guardian(student_id)
    return StudentWithGuardianResponse(**data.__dict__)


@router.get(
    "/guardians/{person_id}/students",
    response_model=list[GuardianStudentResponse],
    dependencies=[Depends(verify_internal_key)],
)
async def list_guardian_students(
    person_id: UUID,
    queries: Annotated[InternalQueryService, Depends(get_internal_query_service)],
) -> list[GuardianStudentResponse]:
    """The kids of a guardian, so classroom-service can show the parents'
    portal the classes of each one. 404 if that person isn't a guardian."""
    students = await queries.list_guardian_students(person_id)
    return [GuardianStudentResponse(**s.__dict__) for s in students]


@router.get(
    "/teachers/{person_id}",
    response_model=TeacherNameResponse,
    dependencies=[Depends(verify_internal_key)],
)
async def get_teacher_name(
    person_id: UUID,
    queries: Annotated[InternalQueryService, Depends(get_internal_query_service)],
) -> TeacherNameResponse:
    """The name of a teacher, so classroom-service can say who answered a
    request in the notification it sends to the guardian."""
    data = await queries.get_teacher_name(person_id)
    return TeacherNameResponse(first_name=data.first_name, last_name=data.last_name)


@router.get(
    "/teachers/{person_id}/profile",
    response_model=TeacherPublicProfileResponse,
    dependencies=[Depends(verify_internal_key)],
)
async def get_teacher_public_profile(
    person_id: UUID,
    queries: Annotated[InternalQueryService, Depends(get_internal_query_service)],
) -> TeacherPublicProfileResponse:
    """The name, institution and profile of a teacher (about, studies,
    experience), so classroom-service can show a family who teaches a class
    (HU-97). Never their contact or document."""
    data = await queries.get_teacher_public_profile(person_id)
    profile = TeacherProfileResponse.from_entity(data.profile)
    return TeacherPublicProfileResponse(
        first_name=data.first_name,
        last_name=data.last_name,
        institution=data.institution,
        **profile.model_dump(),
    )


@router.post(
    "/portal-access/check",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    dependencies=[Depends(verify_internal_key)],
)
async def check_portal_access(
    payload: PortalAccessCheckRequest,
    portal_access: Annotated[RedisPortalAccessStore, Depends(get_portal_access_store)],
) -> None:
    """204 if that session of the guardian has the parents' portal open, 403
    acceso_portal_requerido if not. Used by notification-service, the same
    rule identity-service applies to its own portal routes."""
    settings = get_settings()
    if payload.renew:
        is_open = await portal_access.renovar(
            payload.person_id, payload.session_id, settings.portal_access_ttl_sec, settings.portal_access_max_age_sec
        )
    else:
        is_open = await portal_access.esta_abierto(
            payload.person_id, payload.session_id, settings.portal_access_max_age_sec
        )
    if not is_open:
        raise PortalAccessRequired()
