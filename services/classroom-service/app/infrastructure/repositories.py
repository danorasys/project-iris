from __future__ import annotations

from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.entities import STATUS_ACCEPTED, STATUS_PENDING, Classroom, Enrollment, EnrollmentCounts
from app.infrastructure.models import ClassroomModel, EnrollmentModel


def _classroom_to_entity(m: ClassroomModel) -> Classroom:
    return Classroom(
        id=m.id,
        teacher_id=m.teacher_id,
        name=m.name,
        description=m.description,
        enrollment_code=m.enrollment_code,
        created_at=m.created_at,
        logo_key=m.logo_key,
        color=m.color,
        area=m.area,
        area_other=m.area_other,
        grade=m.grade,
    )


def _enrollment_to_entity(m: EnrollmentModel) -> Enrollment:
    return Enrollment(
        id=m.id,
        student_id=m.student_id,
        classroom_id=m.classroom_id,
        status=m.status,
        requested_at=m.requested_at,
        resolved_at=m.resolved_at,
    )


class SqlAlchemyClassroomRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, classroom_id: UUID) -> Classroom | None:
        m = await self._session.get(ClassroomModel, classroom_id)
        return _classroom_to_entity(m) if m else None

    async def get_by_code(self, enrollment_code: str) -> Classroom | None:
        result = await self._session.execute(select(ClassroomModel).where(ClassroomModel.enrollment_code == enrollment_code))
        m = result.scalar_one_or_none()
        return _classroom_to_entity(m) if m else None

    async def list_by_teacher(self, teacher_id: UUID) -> list[Classroom]:
        result = await self._session.execute(
            select(ClassroomModel).where(ClassroomModel.teacher_id == teacher_id).order_by(ClassroomModel.created_at.desc())
        )
        return [_classroom_to_entity(m) for m in result.scalars().all()]

    async def list_by_ids(self, classroom_ids: list[UUID]) -> list[Classroom]:
        if not classroom_ids:
            return []
        result = await self._session.execute(select(ClassroomModel).where(ClassroomModel.id.in_(classroom_ids)))
        return [_classroom_to_entity(m) for m in result.scalars().all()]

    async def add(self, classroom: Classroom) -> None:
        self._session.add(
            ClassroomModel(
                id=classroom.id,
                teacher_id=classroom.teacher_id,
                name=classroom.name,
                description=classroom.description,
                logo_key=classroom.logo_key,
                enrollment_code=classroom.enrollment_code,
                created_at=classroom.created_at,
                color=classroom.color,
                area=classroom.area,
                area_other=classroom.area_other,
                grade=classroom.grade,
            )
        )

    async def update(self, classroom: Classroom) -> None:
        m = await self._session.get(ClassroomModel, classroom.id)
        if m is None:
            return
        m.name = classroom.name
        m.description = classroom.description
        m.logo_key = classroom.logo_key
        m.color = classroom.color
        m.area = classroom.area
        m.area_other = classroom.area_other
        m.grade = classroom.grade

    async def delete(self, classroom_id: UUID) -> None:
        # Through the ORM, so the enrollments go too (cascade) on every database.
        m = await self._session.get(ClassroomModel, classroom_id)
        if m is not None:
            await self._session.delete(m)


class SqlAlchemyEnrollmentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, enrollment_id: UUID) -> Enrollment | None:
        m = await self._session.get(EnrollmentModel, enrollment_id)
        return _enrollment_to_entity(m) if m else None

    async def get_by_student_and_classroom(self, student_id: UUID, classroom_id: UUID) -> Enrollment | None:
        result = await self._session.execute(
            select(EnrollmentModel).where(
                EnrollmentModel.student_id == student_id,
                EnrollmentModel.classroom_id == classroom_id,
            )
        )
        m = result.scalar_one_or_none()
        return _enrollment_to_entity(m) if m else None

    async def list_pending_by_classroom(self, classroom_id: UUID) -> list[Enrollment]:
        result = await self._session.execute(
            select(EnrollmentModel)
            .where(EnrollmentModel.classroom_id == classroom_id, EnrollmentModel.status == STATUS_PENDING)
            .order_by(EnrollmentModel.requested_at.asc())
        )
        return [_enrollment_to_entity(m) for m in result.scalars().all()]

    async def list_accepted_by_classroom(self, classroom_id: UUID) -> list[Enrollment]:
        result = await self._session.execute(
            select(EnrollmentModel).where(
                EnrollmentModel.classroom_id == classroom_id, EnrollmentModel.status == STATUS_ACCEPTED
            )
        )
        return [_enrollment_to_entity(m) for m in result.scalars().all()]

    async def list_accepted_by_student(self, student_id: UUID) -> list[Enrollment]:
        result = await self._session.execute(
            select(EnrollmentModel).where(
                EnrollmentModel.student_id == student_id, EnrollmentModel.status == STATUS_ACCEPTED
            )
        )
        return [_enrollment_to_entity(m) for m in result.scalars().all()]

    # The index on student_id serves it.
    async def list_active_by_students(self, student_ids: list[UUID]) -> list[Enrollment]:
        if not student_ids:
            return []
        result = await self._session.execute(
            select(EnrollmentModel).where(
                EnrollmentModel.student_id.in_(student_ids),
                EnrollmentModel.status.in_((STATUS_PENDING, STATUS_ACCEPTED)),
            )
        )
        return [_enrollment_to_entity(m) for m in result.scalars().all()]

    async def count_by_classrooms(self, classroom_ids: list[UUID]) -> dict[UUID, EnrollmentCounts]:
        if not classroom_ids:
            return {}
        # One GROUP BY by classroom and status, served by
        # ix_enrollments_classroom_status. Rejected requests aren't counted.
        result = await self._session.execute(
            select(EnrollmentModel.classroom_id, EnrollmentModel.status, func.count())
            .where(
                EnrollmentModel.classroom_id.in_(classroom_ids),
                EnrollmentModel.status.in_((STATUS_PENDING, STATUS_ACCEPTED)),
            )
            .group_by(EnrollmentModel.classroom_id, EnrollmentModel.status)
        )
        rows: dict[UUID, dict[str, int]] = {}
        for classroom_id, status, count in result.all():
            rows.setdefault(classroom_id, {})[status] = count
        return {
            classroom_id: EnrollmentCounts(
                pending=by_status.get(STATUS_PENDING, 0), accepted=by_status.get(STATUS_ACCEPTED, 0)
            )
            for classroom_id, by_status in rows.items()
        }

    async def add(self, enrollment: Enrollment) -> None:
        self._session.add(
            EnrollmentModel(
                id=enrollment.id,
                student_id=enrollment.student_id,
                classroom_id=enrollment.classroom_id,
                status=enrollment.status,
                requested_at=enrollment.requested_at,
                resolved_at=enrollment.resolved_at,
            )
        )

    async def update(self, enrollment: Enrollment) -> None:
        m = await self._session.get(EnrollmentModel, enrollment.id)
        if m is None:
            return
        m.status = enrollment.status
        m.requested_at = enrollment.requested_at
        m.resolved_at = enrollment.resolved_at

    async def delete(self, enrollment_id: UUID) -> None:
        await self._session.execute(delete(EnrollmentModel).where(EnrollmentModel.id == enrollment_id))
