from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.entities import (
    Avatar,
    Consent,
    DocumentType,
    Guardian,
    Person,
    RelationshipType,
    Student,
    SupportCondition,
    Teacher,
)
from app.infrastructure.models import (
    AvatarModel,
    ConsentModel,
    DocumentTypeModel,
    GuardianModel,
    PersonModel,
    RelationshipTypeModel,
    StudentModel,
    SupportConditionModel,
    TeacherModel,
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
    )


def _guardian_to_entity(m: GuardianModel) -> Guardian:
    return Guardian(
        id=m.id,
        person_id=m.person_id,
        relationship_type_id=m.relationship_type_id,
        totp_secret=m.totp_secret,
        totp_enabled=m.totp_enabled,
    )


def _document_type_to_entity(m: DocumentTypeModel) -> DocumentType:
    return DocumentType(id=m.id, name=m.name)


def _relationship_type_to_entity(m: RelationshipTypeModel) -> RelationshipType:
    return RelationshipType(id=m.id, name=m.name)


def _support_condition_to_entity(m: SupportConditionModel) -> SupportCondition:
    return SupportCondition(id=m.id, name=m.name)


def _avatar_to_entity(m: AvatarModel) -> Avatar:
    return Avatar(id=m.id, name=m.name, image_path=m.image_path)


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
        support_condition_id=m.support_condition_id,
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
        await self._session.execute(delete(PersonModel).where(PersonModel.id == person_id))

    async def update_totp(self, guardian_id: UUID, totp_secret: str | None, totp_enabled: bool) -> None:
        m = await self._session.get(GuardianModel, guardian_id)
        if m is not None:
            m.totp_secret = totp_secret
            m.totp_enabled = totp_enabled

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
                support_condition_id=student.support_condition_id,
                support_condition_other=student.support_condition_other,
                additional_support_need=student.additional_support_need,
            )
        )

    async def update_avatar(self, student_id: UUID, avatar_id: int) -> None:
        m = await self._session.get(StudentModel, student_id)
        if m is not None:
            m.avatar_id = avatar_id


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
