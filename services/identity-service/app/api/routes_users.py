from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, get_current_user, get_user_query_service
from app.api.schemas import CurrentUserResponse
from app.application.user_service import UserQueryService
from app.domain.exceptions import ResourceNotFound

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=CurrentUserResponse)
async def read_current_user(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    users: Annotated[UserQueryService, Depends(get_user_query_service)],
) -> CurrentUserResponse:
    if user.role == "student":
        raise ResourceNotFound(
            "Los perfiles de estudiante no tienen datos de cuenta propios; usa /auth/students/profile."
        )
    person = await users.get_current_user(user.subject_id)
    return CurrentUserResponse(
        id=person.id,
        first_name=person.first_name,
        last_name=person.last_name,
        email=person.email,
        role=user.role,
    )
