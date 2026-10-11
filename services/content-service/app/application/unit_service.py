# Unit use cases (HU-101): the groups of lessons of a classroom.
#
# Pure orchestration over the ports in app.domain.ports, like lesson_service.

from __future__ import annotations

import uuid
from typing import Callable
from uuid import UUID

from app.application.dtos import UnitDbaChoice
from app.domain.entities import (
    STATUS_DRAFT,
    STATUS_PUBLISHED,
    ClassroomContentSummary,
    Dba,
    DbaPoint,
    Lesson,
    Unit,
    ValidatedUser,
)
from app.domain.exceptions import (
    ClassroomNotEditable,
    InvalidDba,
    InvalidOrder,
    PermissionDenied,
    ResourceNotFound,
    UnitNotEmpty,
)
from app.domain.ports import ClassroomClient, UnitOfWork

UowFactory = Callable[[], "UnitOfWork"]


class UnitService:
    def __init__(self, uow_factory: UowFactory, classroom_client: ClassroomClient) -> None:
        self._uow_factory = uow_factory
        self._classroom = classroom_client

    async def _require_owner(self, classroom_id: UUID, user: ValidatedUser, correlation_id: str | None) -> None:
        # Only the teacher of the classroom, asked to classroom-service
        # (cached ~30 s, fail-closed to 403).
        if user.role != "teacher" or not await self._classroom.verify_access(
            classroom_id, user.subject_id, "teacher", correlation_id
        ):
            raise PermissionDenied("No eres el docente dueño de esta clase.")

    # For changes: their teacher, and the class still open for edits (not
    # archived, HU-105). Reading only needs _require_owner.
    async def _require_editor(self, classroom_id: UUID, user: ValidatedUser, correlation_id: str | None) -> None:
        await self._require_owner(classroom_id, user, correlation_id)
        if not await self._classroom.verify_access(classroom_id, user.subject_id, "editor", correlation_id):
            raise ClassroomNotEditable()

    async def _own_unit(self, uow: UnitOfWork, unit_id: UUID, user: ValidatedUser) -> Unit:
        unit = await uow.units.get_by_id(unit_id)
        if unit is None:
            raise ResourceNotFound("La unidad no existe.")
        if user.role != "teacher" or unit.teacher_id != user.subject_id:
            raise PermissionDenied("No eres el docente de esta unidad.")
        if not await self._classroom.verify_access(unit.classroom_id, user.subject_id, "editor", None):
            raise ClassroomNotEditable()
        return unit

    # Units and lessons of every classroom of the teacher, for the Inicio of
    # the portal. It only reads their own rows (by teacher_id), so it doesn't
    # need to ask classroom-service who owns each classroom. A classroom with
    # nothing built yet isn't in the result.
    async def content_summary(self, user: ValidatedUser) -> list[ClassroomContentSummary]:
        if user.role != "teacher":
            raise PermissionDenied("Tu tipo de cuenta no tiene acceso a esta operación.")
        async with self._uow_factory() as uow:
            units = await uow.units.count_by_teacher(user.subject_id)
            lessons = await uow.lessons.count_by_teacher(user.subject_id)
        return [
            ClassroomContentSummary(
                classroom_id=classroom_id,
                units=units.get(classroom_id, 0),
                published_lessons=lessons.get(classroom_id, {}).get(STATUS_PUBLISHED, 0),
                draft_lessons=lessons.get(classroom_id, {}).get(STATUS_DRAFT, 0),
            )
            for classroom_id in sorted(units.keys() | lessons.keys(), key=str)
        ]

    # The units of a classroom with their lessons. The teacher sees them
    # all; a kid only the lessons already published, and only the units
    # that have some.
    async def list_units(
        self, classroom_id: UUID, user: ValidatedUser, correlation_id: str | None
    ) -> list[tuple[Unit, list[Lesson]]]:
        if user.role == "teacher":
            await self._require_owner(classroom_id, user, correlation_id)
            published_only = False
        elif user.role == "student":
            if not await self._classroom.verify_access(classroom_id, user.subject_id, "student", correlation_id):
                raise PermissionDenied("No estás inscrito en esta clase.")
            published_only = True
        else:
            raise PermissionDenied("Tu tipo de cuenta no tiene acceso a esta operación.")

        async with self._uow_factory() as uow:
            units = await uow.units.list_by_classroom(classroom_id)
            lessons = await uow.lessons.list_by_classroom(classroom_id, published_only=published_only)
        by_unit: dict[UUID, list[Lesson]] = {unit.id: [] for unit in units}
        for lesson in lessons:
            by_unit.setdefault(lesson.unit_id, []).append(lesson)
        result = [(unit, sorted(by_unit[unit.id], key=lambda lesson: lesson.order_index)) for unit in units]
        return [item for item in result if item[1]] if published_only else result

    async def create_unit(
        self,
        classroom_id: UUID,
        user: ValidatedUser,
        title: str,
        guiding_question: str,
        correlation_id: str | None,
        dba: UnitDbaChoice | None = None,
    ) -> Unit:
        await self._require_editor(classroom_id, user, correlation_id)
        async with self._uow_factory() as uow:
            chosen, own_name, points = await self._unit_dba(uow, dba)
            unit = Unit(
                id=uuid.uuid4(),
                classroom_id=classroom_id,
                teacher_id=user.subject_id,
                title=title,
                guiding_question=guiding_question,
                order_index=await uow.units.count_by_classroom(classroom_id),
                dba=chosen,
                own_dba_name=own_name,
                dba_points=points,
            )
            await uow.units.add(unit)
            await uow.commit()
        return unit

    async def update_unit(
        self,
        unit_id: UUID,
        user: ValidatedUser,
        title: str | None,
        guiding_question: str | None,
        dba: UnitDbaChoice | None = None,
    ) -> Unit:
        async with self._uow_factory() as uow:
            unit = await self._own_unit(uow, unit_id, user)
            if title is not None:
                unit.title = title
            if guiding_question is not None:
                unit.guiding_question = guiding_question
            if dba is not None:
                unit.dba, unit.own_dba_name, unit.dba_points = await self._unit_dba(uow, dba)
            await uow.units.update(unit)
            await uow.commit()
        return unit

    # The DBA chosen for a unit with its evidences: the teacher's own, with
    # only their own evidences, or one of the catalog, which must exist and
    # whose ticked evidences must be of it (kept in its order), then the
    # teacher's own. Whether it fits the class is checked when publishing.
    @staticmethod
    async def _unit_dba(
        uow: UnitOfWork, choice: UnitDbaChoice | None
    ) -> tuple[Dba | None, str | None, list[DbaPoint]]:
        if choice is None:
            return None, None, []
        own_points = [DbaPoint(None, text) for text in choice.own_points]
        if choice.own_name is not None:
            if choice.evidence_ids:
                raise InvalidDba("Un DBA propio no lleva evidencias del catálogo: escribe tus propias evidencias de aprendizaje.")
            return None, choice.own_name, own_points
        dba = await uow.dba.get_by_id(choice.dba_id or "")
        if dba is None:
            raise InvalidDba("El DBA elegido no existe.")
        chosen = set(choice.evidence_ids)
        if len(chosen) != len(choice.evidence_ids) or not chosen <= {e.id for e in dba.evidences}:
            raise InvalidDba("Las evidencias elegidas no son de ese DBA.")
        evidences = [DbaPoint(e.id, e.text) for e in dba.evidences if e.id in chosen]
        return dba, None, evidences + own_points

    # The new order names every unit of the classroom exactly once.
    async def reorder_units(
        self, classroom_id: UUID, user: ValidatedUser, unit_ids: list[UUID], correlation_id: str | None
    ) -> list[Unit]:
        await self._require_editor(classroom_id, user, correlation_id)
        async with self._uow_factory() as uow:
            units = await uow.units.list_by_classroom(classroom_id)
            if len(unit_ids) != len(set(unit_ids)) or set(unit_ids) != {unit.id for unit in units}:
                raise InvalidOrder()
            position = {unit_id: index for index, unit_id in enumerate(unit_ids)}
            for unit in units:
                unit.order_index = position[unit.id]
                await uow.units.update(unit)
            await uow.commit()
        return sorted(units, key=lambda unit: unit.order_index)

    # Only an empty unit goes (UnitNotEmpty), and the ones after it move up.
    async def delete_unit(self, unit_id: UUID, user: ValidatedUser) -> None:
        async with self._uow_factory() as uow:
            unit = await self._own_unit(uow, unit_id, user)
            if await uow.lessons.count_by_unit(unit_id):
                raise UnitNotEmpty()
            await uow.units.delete(unit_id)
            for other in await uow.units.list_by_classroom(unit.classroom_id):
                if other.order_index > unit.order_index:
                    other.order_index -= 1
                    await uow.units.update(other)
            await uow.commit()
