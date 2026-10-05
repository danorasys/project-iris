# SQLAlchemy models.
#
# Uuid(as_uuid=True) is SQLAlchemy 2.0's generic type. It maps to the native
# uuid type on PostgreSQL and to CHAR(32) on SQLite, so the schema doesn't need
# to be duplicated between the two dialects.

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.domain.entities import SESSION_END_REASONS, SESSION_ROLES, STUDY_LEVELS
from app.infrastructure.db import Base

_STUDY_LEVELS_SQL = ", ".join(f"'{level}'" for level in STUDY_LEVELS)


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
    # Country code and number apart: the code always comes from a fixed list
    # (the flag picker), so the country never has to be guessed from a text.
    phone_country_code: Mapped[str] = mapped_column(String(3))
    phone_number: Mapped[str] = mapped_column(String(15))
    date_of_birth: Mapped[date] = mapped_column(Date)
    # 2FA of the account, guardian or teacher. Encrypted (Fernet), never plain
    # text, see infrastructure/security.py.
    totp_secret: Mapped[str | None] = mapped_column(Text, nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    guardian: Mapped["GuardianModel | None"] = relationship(back_populates="person", uselist=False, cascade="all, delete-orphan")
    teacher: Mapped["TeacherModel | None"] = relationship(back_populates="person", uselist=False, cascade="all, delete-orphan")


class GuardianModel(Base):
    __tablename__ = "guardians"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    person_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("people.id", ondelete="CASCADE"), unique=True)
    relationship_type_id: Mapped[int] = mapped_column(Integer, ForeignKey("relationship_types.id"))

    person: Mapped[PersonModel] = relationship(back_populates="guardian")
    students: Mapped[list["StudentModel"]] = relationship(back_populates="guardian", cascade="all, delete-orphan")


class TeacherModel(Base):
    __tablename__ = "teachers"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    person_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("people.id", ondelete="CASCADE"), unique=True)
    # Optional, not every teacher works for a school.
    institution: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # The rest of the teacher's profile (HU-96). The studies and jobs are in
    # their own tables, below.
    about: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    person: Mapped[PersonModel] = relationship(back_populates="teacher")


# The studies and jobs keep the order the teacher gave them (position). The
# unique pair (teacher_id, position) is also the index that finds them.
class TeacherStudyModel(Base):
    __tablename__ = "teacher_studies"
    __table_args__ = (
        UniqueConstraint("teacher_id", "position", name="uq_teacher_studies_teacher_position"),
        CheckConstraint(f"level IN ({_STUDY_LEVELS_SQL})", name="ck_teacher_studies_level"),
        # Either it has an end month or it's still in progress, never both or neither.
        CheckConstraint(
            "(in_progress AND ended_on IS NULL) OR (NOT in_progress AND ended_on IS NOT NULL)",
            name="ck_teacher_studies_ended_on",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    teacher_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("teachers.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(SmallInteger)
    level: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(150))
    institution: Mapped[str] = mapped_column(String(150))
    # The first day of the month it ended, the form only asks for month and year.
    ended_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    in_progress: Mapped[bool] = mapped_column(Boolean, default=False)


class TeacherExperienceModel(Base):
    __tablename__ = "teacher_experiences"
    __table_args__ = (
        UniqueConstraint("teacher_id", "position", name="uq_teacher_experiences_teacher_position"),
        CheckConstraint("ended_on IS NULL OR ended_on >= started_on", name="ck_teacher_experiences_dates"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    teacher_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("teachers.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(SmallInteger)
    role: Mapped[str] = mapped_column(String(150))
    place: Mapped[str] = mapped_column(String(150))
    started_on: Mapped[date] = mapped_column(Date)
    ended_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    description: Mapped[str | None] = mapped_column(String(2000), nullable=True)


class AvatarModel(Base):
    __tablename__ = "avatars"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    image_key: Mapped[str] = mapped_column(Text)


# Which conditions each kid has: one row per kid and condition. The pair is
# the primary key, so the same condition can't be twice on the same kid.
class StudentSupportConditionModel(Base):
    __tablename__ = "student_support_conditions"

    student_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), primary_key=True
    )
    support_condition_id: Mapped[int] = mapped_column(Integer, ForeignKey("support_conditions.id"), primary_key=True)


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
    # The conditions are in support_condition_links (a kid can have several).
    # Only set when one of them is "Otra condición (especificar)".
    support_condition_other: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Independent of the conditions: a free-text note for anything else
    # the family wants the teacher to know, always optional.
    additional_support_need: Mapped[str | None] = mapped_column(String(500), nullable=True)

    guardian: Mapped[GuardianModel] = relationship(back_populates="students")
    # Loaded together with the kid in one extra query for all the kids asked
    # (selectin), not one query per kid.
    support_condition_links: Mapped[list[StudentSupportConditionModel]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", passive_deletes=True
    )


# Record of the changes each person made to their own profile or to the
# profile of one of their kids, see ProfileChange. Rows are only added, and
# go away with the person.
class ProfileChangeModel(Base):
    __tablename__ = "profile_changes"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    person_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("people.id", ondelete="CASCADE"))
    # The kid whose profile changed, empty when the person changed their own.
    student_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # Without a foreign key: sessions live in Redis, not in this database.
    session_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Names of the fields, like ["phone_number", "last_name"]. Never values.
    changed_fields: Mapped[list[str]] = mapped_column(JSON)
    declaration_version: Mapped[str] = mapped_column(String(20))
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # A person's changes are looked up together and in order.
    __table_args__ = (Index("ix_profile_changes_person_changed_at", "person_id", "changed_at"),)


_SESSION_ROLES_SQL = ", ".join(f"'{role}'" for role in SESSION_ROLES)
_SESSION_END_REASONS_SQL = ", ".join(f"'{reason}'" for reason in SESSION_END_REASONS)


# One row per sign-in of a guardian or a teacher, see SessionRecord. The
# session id is the same one in the tokens and in profile_changes.session_id.
# Rows go away with the person.
class SessionHistoryModel(Base):
    __tablename__ = "session_history"
    __table_args__ = (
        CheckConstraint(f"role IN ({_SESSION_ROLES_SQL})", name="ck_session_history_role"),
        CheckConstraint(
            f"end_reason IS NULL OR end_reason IN ({_SESSION_END_REASONS_SQL})", name="ck_session_history_end_reason"
        ),
        # Ended means both when and why, open means neither.
        CheckConstraint("(ended_at IS NULL) = (end_reason IS NULL)", name="ck_session_history_ended"),
        # A person's sessions are looked up together, newest first.
        Index("ix_session_history_person_started_at", "person_id", "started_at"),
    )

    session_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    person_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("people.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(10))
    # Only the family, like "Chrome" and "Windows". Never the full User-Agent.
    browser: Mapped[str | None] = mapped_column(String(30), nullable=True)
    operating_system: Mapped[str | None] = mapped_column(String(30), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Last time its token was renewed: the session was in use until about then.
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_reason: Mapped[str | None] = mapped_column(String(30), nullable=True)


# The teacher's own acceptance of the data treatment, given at registration.
class TeacherConsentModel(Base):
    __tablename__ = "teacher_consents"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("teachers.id", ondelete="CASCADE"), index=True
    )
    policy_version: Mapped[str] = mapped_column(String(20))
    accepts_data_processing: Mapped[bool] = mapped_column(Boolean)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class ConsentModel(Base):
    __tablename__ = "consents"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid4)
    guardian_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("guardians.id", ondelete="CASCADE"))
    student_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"))
    policy_version: Mapped[str] = mapped_column(String(20))
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    accepts_data_processing: Mapped[bool] = mapped_column(Boolean, default=False)
    authorizes_support_condition: Mapped[bool] = mapped_column(Boolean, default=False)
