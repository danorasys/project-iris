from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.entities import (
    Avatar,
    Consent,
    DocumentType,
    Guardian,
    Person,
    ProfileChange,
    RelationshipType,
    SessionRecord,
    Student,
    SupportCondition,
    Teacher,
    TeacherConsent,
    TeacherExperience,
    TeacherProfile,
    TeacherStudy,
)
from app.infrastructure.models import (
    AvatarModel,
    ConsentModel,
    DocumentTypeModel,
    GuardianModel,
    PersonModel,
    ProfileChangeModel,
    RelationshipTypeModel,
    SessionHistoryModel,
    StudentModel,
    StudentSupportConditionModel,
    SupportConditionModel,
    TeacherConsentModel,
    TeacherExperienceModel,
    TeacherModel,
    TeacherStudyModel,
)


def _person_to_entity(m: PersonModel) -> Person:
    return Person(
        id=m.id,
        first_name=m.first_name,
        last_name=m.last_name,
        email=m.email,
        hash_password=m.hash_password,
        created_at=m.created_at,
        document_type_id=m.document_type_id,
        document_number=m.document_number,
        document_issued_at=m.document_issued_at,
        phone_country_code=m.phone_country_code,
        phone_number=m.phone_number,
        date_of_birth=m.date_of_birth,
        totp_secret=m.totp_secret,
        totp_enabled=m.totp_enabled,
    )


def _guardian_to_entity(m: GuardianModel) -> Guardian:
    return Guardian(id=m.id, person_id=m.person_id, relationship_type_id=m.relationship_type_id)


def _document_type_to_entity(m: DocumentTypeModel) -> DocumentType:
    return DocumentType(id=m.id, name=m.name)


def _relationship_type_to_entity(m: RelationshipTypeModel) -> RelationshipType:
    return RelationshipType(id=m.id, name=m.name)


def _support_condition_to_entity(m: SupportConditionModel) -> SupportCondition:
    return SupportCondition(id=m.id, name=m.name)


def _avatar_to_entity(m: AvatarModel) -> Avatar:
    return Avatar(id=m.id, name=m.name, image_key=m.image_key, accent_color=m.accent_color)


def _teacher_to_entity(m: TeacherModel) -> Teacher:
    return Teacher(id=m.id, person_id=m.person_id, institution=m.institution)


def _student_to_entity(m: StudentModel) -> Student:
    return Student(
        id=m.id,
        guardian_id=m.guardian_id,
        first_name=m.first_name,
        last_name=m.last_name,
        date_of_birth=m.date_of_birth,
        hash_pin=m.hash_pin,
        avatar_id=m.avatar_id,
        support_condition_ids=sorted(link.support_condition_id for link in m.support_condition_links),
        support_condition_other=m.support_condition_other,
        additional_support_need=m.additional_support_need,
    )


class SqlAlchemyPersonRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_email(self, email: str) -> Person | None:
        result = await self._session.execute(select(PersonModel).where(PersonModel.email == email))
        m = result.scalar_one_or_none()
        return _person_to_entity(m) if m else None

    async def get_by_id(self, person_id: UUID) -> Person | None:
        m = await self._session.get(PersonModel, person_id)
        return _person_to_entity(m) if m else None

    async def get_by_document_number(self, document_number: str) -> Person | None:
        result = await self._session.execute(
            select(PersonModel).where(PersonModel.document_number == document_number)
        )
        m = result.scalar_one_or_none()
        return _person_to_entity(m) if m else None

    async def add(self, person: Person) -> None:
        self._session.add(
            PersonModel(
                id=person.id,
                first_name=person.first_name,
                last_name=person.last_name,
                email=person.email,
                hash_password=person.hash_password,
                created_at=person.created_at,
                document_type_id=person.document_type_id,
                document_number=person.document_number,
                document_issued_at=person.document_issued_at,
                phone_country_code=person.phone_country_code,
                phone_number=person.phone_number,
                date_of_birth=person.date_of_birth,
            )
        )

    async def update_profile(
        self,
        person_id: UUID,
        *,
        first_name: str,
        last_name: str,
        date_of_birth: date,
        phone_country_code: str,
        phone_number: str,
    ) -> None:
        m = await self._session.get(PersonModel, person_id)
        if m is not None:
            m.first_name = first_name
            m.last_name = last_name
            m.date_of_birth = date_of_birth
            m.phone_country_code = phone_country_code
            m.phone_number = phone_number

    async def update_password(self, person_id: UUID, hash_password: str) -> None:
        m = await self._session.get(PersonModel, person_id)
        if m is not None:
            m.hash_password = hash_password

    async def update_totp(self, person_id: UUID, totp_secret: str | None, totp_enabled: bool) -> None:
        m = await self._session.get(PersonModel, person_id)
        if m is not None:
            m.totp_secret = totp_secret
            m.totp_enabled = totp_enabled


class SqlAlchemyGuardianRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_person_id(self, person_id: UUID) -> Guardian | None:
        result = await self._session.execute(select(GuardianModel).where(GuardianModel.person_id == person_id))
        m = result.scalar_one_or_none()
        return _guardian_to_entity(m) if m else None

    async def get_by_id(self, guardian_id: UUID) -> Guardian | None:
        m = await self._session.get(GuardianModel, guardian_id)
        return _guardian_to_entity(m) if m else None

    async def add(self, guardian: Guardian) -> None:
        self._session.add(
            GuardianModel(
                id=guardian.id,
                person_id=guardian.person_id,
                relationship_type_id=guardian.relationship_type_id,
            )
        )

    async def delete(self, guardian_id: UUID) -> None:
        guardian = await self._session.get(GuardianModel, guardian_id)
        if guardian is None:
            return
        person_id = guardian.person_id
        await self._session.execute(delete(GuardianModel).where(GuardianModel.id == guardian_id))
        # The database also deletes them on its own (ON DELETE CASCADE), but
        # deleting them here doesn't depend on that being turned on.
        await self._session.execute(delete(ProfileChangeModel).where(ProfileChangeModel.person_id == person_id))
        await self._session.execute(delete(SessionHistoryModel).where(SessionHistoryModel.person_id == person_id))
        await self._session.execute(delete(PersonModel).where(PersonModel.id == person_id))

    async def update_relationship_type(self, guardian_id: UUID, relationship_type_id: int) -> None:
        m = await self._session.get(GuardianModel, guardian_id)
        if m is not None:
            m.relationship_type_id = relationship_type_id


class SqlAlchemyTeacherRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_person_id(self, person_id: UUID) -> Teacher | None:
        result = await self._session.execute(select(TeacherModel).where(TeacherModel.person_id == person_id))
        m = result.scalar_one_or_none()
        return _teacher_to_entity(m) if m else None

    async def get_by_id(self, teacher_id: UUID) -> Teacher | None:
        m = await self._session.get(TeacherModel, teacher_id)
        return _teacher_to_entity(m) if m else None

    async def add(self, teacher: Teacher) -> None:
        self._session.add(TeacherModel(id=teacher.id, person_id=teacher.person_id, institution=teacher.institution))

    async def update_institution(self, teacher_id: UUID, institution: str | None) -> None:
        m = await self._session.get(TeacherModel, teacher_id)
        if m is not None:
            m.institution = institution


class SqlAlchemyTeacherProfileRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # Three small reads by teacher_id, each one served by its own index.
    async def get(self, teacher_id: UUID) -> TeacherProfile:
        teacher = await self._session.get(TeacherModel, teacher_id)
        if teacher is None:
            return TeacherProfile()
        studies = await self._session.execute(
            select(TeacherStudyModel).where(TeacherStudyModel.teacher_id == teacher_id).order_by(TeacherStudyModel.position)
        )
        experiences = await self._session.execute(
            select(TeacherExperienceModel)
            .where(TeacherExperienceModel.teacher_id == teacher_id)
            .order_by(TeacherExperienceModel.position)
        )
        return TeacherProfile(
            about=teacher.about,
            studies=[
                TeacherStudy(
                    level=m.level, title=m.title, institution=m.institution, ended_on=m.ended_on, in_progress=m.in_progress
                )
                for m in studies.scalars().all()
            ],
            experiences=[
                TeacherExperience(
                    role=m.role, place=m.place, started_on=m.started_on, ended_on=m.ended_on, description=m.description
                )
                for m in experiences.scalars().all()
            ],
        )

    # The old rows are deleted first and right away, so the new ones never
    # bump into them on the (teacher_id, position) unique pair.
    async def replace(self, teacher_id: UUID, profile: TeacherProfile) -> None:
        teacher = await self._session.get(TeacherModel, teacher_id)
        if teacher is None:
            return
        teacher.about = profile.about
        for model in (TeacherStudyModel, TeacherExperienceModel):
            await self._session.execute(delete(model).where(model.teacher_id == teacher_id))
        self._session.add_all(
            [
                TeacherStudyModel(
                    teacher_id=teacher_id,
                    position=position,
                    level=study.level,
                    title=study.title,
                    institution=study.institution,
                    ended_on=study.ended_on,
                    in_progress=study.in_progress,
                )
                for position, study in enumerate(profile.studies)
            ]
        )
        self._session.add_all(
            [
                TeacherExperienceModel(
                    teacher_id=teacher_id,
                    position=position,
                    role=job.role,
                    place=job.place,
                    started_on=job.started_on,
                    ended_on=job.ended_on,
                    description=job.description,
                )
                for position, job in enumerate(profile.experiences)
            ]
        )


class SqlAlchemyStudentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, student_id: UUID) -> Student | None:
        m = await self._session.get(StudentModel, student_id)
        return _student_to_entity(m) if m else None

    async def list_by_guardian(self, guardian_id: UUID) -> list[Student]:
        result = await self._session.execute(select(StudentModel).where(StudentModel.guardian_id == guardian_id))
        return [_student_to_entity(m) for m in result.scalars().all()]

    async def add(self, student: Student) -> None:
        self._session.add(
            StudentModel(
                id=student.id,
                guardian_id=student.guardian_id,
                first_name=student.first_name,
                last_name=student.last_name,
                date_of_birth=student.date_of_birth,
                hash_pin=student.hash_pin,
                avatar_id=student.avatar_id,
                support_condition_links=[
                    StudentSupportConditionModel(support_condition_id=condition_id)
                    for condition_id in student.support_condition_ids
                ],
                support_condition_other=student.support_condition_other,
                additional_support_need=student.additional_support_need,
            )
        )

    async def update_avatar(self, student_id: UUID, avatar_id: int) -> None:
        m = await self._session.get(StudentModel, student_id)
        if m is not None:
            m.avatar_id = avatar_id

    async def update_details(
        self,
        student_id: UUID,
        *,
        first_name: str,
        last_name: str,
        date_of_birth: date,
        avatar_id: int,
        support_condition_ids: list[int],
        support_condition_other: str | None,
        additional_support_need: str | None,
    ) -> None:
        m = await self._session.get(StudentModel, student_id)
        if m is not None:
            m.first_name = first_name
            m.last_name = last_name
            m.date_of_birth = date_of_birth
            m.avatar_id = avatar_id
            # Only the rows that changed are touched: the ones no longer
            # chosen are deleted and the new ones added.
            wanted = set(support_condition_ids)
            kept = [link for link in m.support_condition_links if link.support_condition_id in wanted]
            already_there = {link.support_condition_id for link in kept}
            added = [
                StudentSupportConditionModel(support_condition_id=condition_id)
                for condition_id in sorted(wanted - already_there)
            ]
            m.support_condition_links = kept + added
            m.support_condition_other = support_condition_other
            m.additional_support_need = additional_support_need

    async def update_pin(self, student_id: UUID, hash_pin: str) -> None:
        m = await self._session.get(StudentModel, student_id)
        if m is not None:
            m.hash_pin = hash_pin


class SqlAlchemyProfileChangeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, change: ProfileChange) -> None:
        self._session.add(
            ProfileChangeModel(
                id=change.id,
                person_id=change.person_id,
                student_id=change.student_id,
                session_id=change.session_id,
                changed_fields=change.changed_fields,
                declaration_version=change.declaration_version,
                changed_at=change.changed_at,
            )
        )


class SqlAlchemySessionHistoryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, record: SessionRecord) -> None:
        self._session.add(
            SessionHistoryModel(
                session_id=record.session_id,
                person_id=record.person_id,
                role=record.role,
                browser=record.browser,
                operating_system=record.operating_system,
                started_at=record.started_at,
                last_active_at=record.last_active_at,
                ended_at=record.ended_at,
                end_reason=record.end_reason,
            )
        )

    async def touch(self, session_id: str, at: datetime) -> None:
        await self._session.execute(
            update(SessionHistoryModel)
            .where(SessionHistoryModel.session_id == session_id, SessionHistoryModel.ended_at.is_(None))
            .values(last_active_at=at)
        )

    # Only open sessions: an ended one keeps how and when it ended first.
    async def end(self, session_id: str, at: datetime, reason: str) -> None:
        await self._session.execute(
            update(SessionHistoryModel)
            .where(SessionHistoryModel.session_id == session_id, SessionHistoryModel.ended_at.is_(None))
            .values(ended_at=at, end_reason=reason)
        )

    async def end_all(self, person_id: UUID, at: datetime, reason: str) -> None:
        await self._session.execute(
            update(SessionHistoryModel)
            .where(SessionHistoryModel.person_id == person_id, SessionHistoryModel.ended_at.is_(None))
            .values(ended_at=at, end_reason=reason)
        )


class SqlAlchemyConsentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, consent: Consent) -> None:
        self._session.add(
            ConsentModel(
                id=consent.id,
                guardian_id=consent.guardian_id,
                student_id=consent.student_id,
                policy_version=consent.policy_version,
                granted_at=consent.granted_at,
                accepts_data_processing=consent.accepts_data_processing,
                authorizes_support_condition=consent.authorizes_support_condition,
            )
        )


class SqlAlchemyTeacherConsentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, consent: TeacherConsent) -> None:
        self._session.add(
            TeacherConsentModel(
                id=consent.id,
                teacher_id=consent.teacher_id,
                policy_version=consent.policy_version,
                accepts_data_processing=consent.accepts_data_processing,
                granted_at=consent.granted_at,
            )
        )


class SqlAlchemyDocumentTypeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_all(self) -> list[DocumentType]:
        result = await self._session.execute(select(DocumentTypeModel).order_by(DocumentTypeModel.id))
        return [_document_type_to_entity(m) for m in result.scalars().all()]

    async def get_by_id(self, document_type_id: int) -> DocumentType | None:
        m = await self._session.get(DocumentTypeModel, document_type_id)
        return _document_type_to_entity(m) if m else None


class SqlAlchemyRelationshipTypeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_all(self) -> list[RelationshipType]:
        result = await self._session.execute(select(RelationshipTypeModel).order_by(RelationshipTypeModel.id))
        return [_relationship_type_to_entity(m) for m in result.scalars().all()]

    async def get_by_id(self, relationship_type_id: int) -> RelationshipType | None:
        m = await self._session.get(RelationshipTypeModel, relationship_type_id)
        return _relationship_type_to_entity(m) if m else None


class SqlAlchemySupportConditionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_all(self) -> list[SupportCondition]:
        result = await self._session.execute(select(SupportConditionModel).order_by(SupportConditionModel.id))
        return [_support_condition_to_entity(m) for m in result.scalars().all()]

    async def get_by_id(self, support_condition_id: int) -> SupportCondition | None:
        m = await self._session.get(SupportConditionModel, support_condition_id)
        return _support_condition_to_entity(m) if m else None


class SqlAlchemyAvatarRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_all(self) -> list[Avatar]:
        result = await self._session.execute(select(AvatarModel).order_by(AvatarModel.id))
        return [_avatar_to_entity(m) for m in result.scalars().all()]

    async def get_by_id(self, avatar_id: int) -> Avatar | None:
        m = await self._session.get(AvatarModel, avatar_id)
        return _avatar_to_entity(m) if m else None
