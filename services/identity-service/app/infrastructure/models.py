# SQLAlchemy models.
#
# Uuid(as_uuid=True) is SQLAlchemy 2.0's generic type. It maps to the native
# uuid type on PostgreSQL and to CHAR(32) on SQLite, so the schema doesn't need
# to be duplicated between the two dialects.

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.db import Base


def _uuid4() -> uuid.UUID:
    return uuid.uuid4()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class DocumentTypeModel(Base):
    __tablename__ = "document_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)


class RelationshipTypeModel(Base):
    __tablename__ = "relationship_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)


class SupportConditionModel(Base):
    __tablename__ = "support_conditions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(150), unique=True)


class PersonModel(Base):
    __tablename__ = "people"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    first_name: Mapped[str] = mapped_column(String(120))
    last_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hash_password: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    document_type_id: Mapped[int] = mapped_column(Integer, ForeignKey("document_types.id"))
    document_number: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    # Nullable: teacher registration doesn't collect it yet, only guardians do
    # (see GuardianDataRequest). A person row created either way must stay valid.
    document_issued_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Split rather than a single E.164 string: the calling code is always
    # chosen from a fixed, known list (the country-flag selector on the
    # frontend), so keeping it apart from the freely-typed national number
    # avoids ever having to re-parse a formatted string to answer "what
    # country is this person in" (see internal_service.py's guardian_phone,
    # which reassembles E.164 for display, the one place that still needs it).
    phone_country_code: Mapped[str] = mapped_column(String(3))
    phone_number: Mapped[str] = mapped_column(String(15))
    date_of_birth: Mapped[date] = mapped_column(Date)

    guardian: Mapped["GuardianModel | None"] = relationship(back_populates="person", uselist=False, cascade="all, delete-orphan")
    teacher: Mapped["TeacherModel | None"] = relationship(back_populates="person", uselist=False, cascade="all, delete-orphan")


class GuardianModel(Base):
    __tablename__ = "guardians"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    person_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("people.id", ondelete="CASCADE"), unique=True)
    relationship_type_id: Mapped[int] = mapped_column(Integer, ForeignKey("relationship_types.id"))
    # Encrypted (Fernet), never plain text — see infrastructure/security.py.
    totp_secret: Mapped[str | None] = mapped_column(Text, nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    person: Mapped[PersonModel] = relationship(back_populates="guardian")
    students: Mapped[list["StudentModel"]] = relationship(back_populates="guardian", cascade="all, delete-orphan")


class TeacherModel(Base):
    __tablename__ = "teachers"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    person_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("people.id", ondelete="CASCADE"), unique=True)
    institution: Mapped[str] = mapped_column(String(200))

    person: Mapped[PersonModel] = relationship(back_populates="teacher")


class AvatarModel(Base):
    __tablename__ = "avatars"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    image_path: Mapped[str] = mapped_column(Text)


class StudentModel(Base):
    __tablename__ = "students"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    # Indexed: list_by_guardian filters students by this column.
    guardian_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("guardians.id", ondelete="CASCADE"), index=True
    )
    first_name: Mapped[str] = mapped_column(String(120))
    last_name: Mapped[str] = mapped_column(String(120))
    date_of_birth: Mapped[date] = mapped_column(Date)
    hash_pin: Mapped[str] = mapped_column(String(255))
    avatar_id: Mapped[int] = mapped_column(Integer, ForeignKey("avatars.id"))
    support_condition_id: Mapped[int] = mapped_column(Integer, ForeignKey("support_conditions.id"))
    # Only set when support_condition_id points to "Otra condición (especificar)".
    support_condition_other: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Independent of support_condition_id: a free-text note for anything else
    # the family wants the teacher to know, always optional.
    additional_support_need: Mapped[str | None] = mapped_column(String(500), nullable=True)

    guardian: Mapped[GuardianModel] = relationship(back_populates="students")


class ConsentModel(Base):
    __tablename__ = "consents"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    guardian_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("guardians.id", ondelete="CASCADE"))
    student_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"))
    policy_version: Mapped[str] = mapped_column(String(20))
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    accepts_data_processing: Mapped[bool] = mapped_column(Boolean, default=False)
    authorizes_support_condition: Mapped[bool] = mapped_column(Boolean, default=False)
