"""Internal endpoint the other services use to validate a JWT without
duplicating the verification logic. Protected by X-Internal-Key on top of
network isolation, a private network or mTLS in production."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.api.deps import get_auth_service, get_internal_query_service, verify_internal_key
from app.api.schemas import StudentWithGuardianResponse, TokenClaimsResponse
from app.application.auth_service import AuthService
from app.application.internal_service import InternalQueryService
from app.domain.exceptions import InvalidToken

router = APIRouter(prefix="/internal", tags=["internal"])
_bearer = HTTPBearer(auto_error=False)


@router.get("/tokens/validate", response_model=TokenClaimsResponse, dependencies=[Depends(verify_internal_key)])
async def validate_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    auth: Annotated[AuthService, Depends(get_auth_service)],
) -> TokenClaimsResponse:
    if credentials is None:
        raise InvalidToken("Falta el token a validar.")
    claims = await auth.validate_access_token(credentials.credentials)
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
