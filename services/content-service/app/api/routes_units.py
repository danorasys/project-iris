"""Routes for the units of a classroom and the lessons inside each one."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.deps import get_lesson_service, get_unit_service, require_role
from app.api.mappers import lesson_detail_response, lesson_response, unit_response, unit_with_lessons_response
from app.api.schemas import (
    CreateLessonRequest,
    CreateUnitRequest,
    LessonDetailResponse,
    LessonResponse,
    OrderRequest,
    UnitResponse,
    UnitWithLessonsResponse,
    UpdateUnitRequest,
)
from app.application.lesson_service import LessonService
from app.application.unit_service import UnitService
from app.correlation import get_correlation_id
from app.domain.entities import ValidatedUser

router = APIRouter(tags=["units"])

TeacherUser = Annotated[ValidatedUser, Depends(require_role("teacher"))]
ReaderUser = Annotated[ValidatedUser, Depends(require_role("teacher", "student"))]
Units = Annotated[UnitService, Depends(get_unit_service)]
Lessons = Annotated[LessonService, Depends(get_lesson_service)]


@router.get("/classrooms/{classroom_id}/units", response_model=list[UnitWithLessonsResponse])
async def list_units(classroom_id: UUID, user: ReaderUser, units: Units) -> list[UnitWithLessonsResponse]:
    """The units of a classroom, in order, each with its lessons. A kid only
    gets the published lessons and the units that have some."""
    result = await units.list_units(classroom_id, user, get_correlation_id())
    return [unit_with_lessons_response(unit, lessons) for unit, lessons in result]


@router.post("/classrooms/{classroom_id}/units", response_model=UnitResponse, status_code=status.HTTP_201_CREATED)
async def create_unit(
    classroom_id: UUID, payload: CreateUnitRequest, user: TeacherUser, units: Units
) -> UnitResponse:
    """A new unit at the end of the classroom (HU-101)."""
    unit = await units.create_unit(classroom_id, user, payload.title, payload.guiding_question, get_correlation_id())
    return unit_response(unit)


@router.put("/classrooms/{classroom_id}/units/order", response_model=list[UnitResponse])
async def reorder_units(
    classroom_id: UUID, payload: OrderRequest, user: TeacherUser, units: Units
) -> list[UnitResponse]:
    """Every unit of the classroom in its new order, each one once."""
    result = await units.reorder_units(classroom_id, user, payload.ids, get_correlation_id())
    return [unit_response(unit) for unit in result]


@router.patch("/units/{unit_id}", response_model=UnitResponse)
async def update_unit(unit_id: UUID, payload: UpdateUnitRequest, user: TeacherUser, units: Units) -> UnitResponse:
    unit = await units.update_unit(unit_id, user, payload.title, payload.guiding_question)
    return unit_response(unit)


@router.delete("/units/{unit_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_unit(unit_id: UUID, user: TeacherUser, units: Units) -> None:
    """Only an empty unit: 409 `unidad_con_lecciones` while it has lessons."""
    await units.delete_unit(unit_id, user)


@router.post("/units/{unit_id}/lessons", response_model=LessonDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_lesson(
    unit_id: UUID, payload: CreateLessonRequest, user: TeacherUser, lessons: Lessons
) -> LessonDetailResponse:
    """A new lesson at the end of the unit, as a draft (HU-78, HU-102)."""
    lesson = await lessons.create_lesson(unit_id, user, payload.title, payload.purpose, payload.learning_goal)
    return lesson_detail_response(lesson, for_teacher=True)


@router.put("/units/{unit_id}/lessons/order", response_model=list[LessonResponse])
async def reorder_lessons(
    unit_id: UUID, payload: OrderRequest, user: TeacherUser, lessons: Lessons
) -> list[LessonResponse]:
    """Every lesson of the unit in its new order, each one once."""
    result = await lessons.reorder_lessons(unit_id, user, payload.ids)
    return [lesson_response(lesson) for lesson in result]
