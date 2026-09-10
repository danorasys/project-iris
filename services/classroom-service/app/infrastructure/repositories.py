from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.entities import STATUS_ACCEPTED, STATUS_PENDING, Classroom, Enrollment
from app.infrastructure.models import ClassroomModel, EnrollmentModel


def _classroom_to_entity(m: ClassroomModel) -> Classroom:
    return Classroom(
        id=m.id,
        teacher_id=m.teacher_id,
        name=m.name,
        description=m.description,
        enrollment_code=m.enrollment_code,
        created_at=m.created_at,
        logo_url=m.logo_url,
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
                logo_url=classroom.logo_url,
                enrollment_code=classroom.enrollment_code,
                created_at=classroom.created_at,
            )
        )

    async def update(self, classroom: Classroom) -> None:
        m = await self._session.get(ClassroomModel, classroom.id)
        if m is None:
            return
        m.name = classroom.name
        m.description = classroom.description
        m.logo_url = classroom.logo_url


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
