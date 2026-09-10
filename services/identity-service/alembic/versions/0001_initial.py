"""initial schema: people, guardians, teachers, students, consents,
document_types, relationship_types

Squashed from the service's earlier incremental migrations into one, now
that the schema itself has settled. Matches the current SQLAlchemy models
exactly, including the CHECK constraint on students.avatar.

Revision ID: 0001
Revises:
Create Date: 2026-09-10
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "document_types",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "relationship_types",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "people",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("first_name", sa.String(length=120), nullable=False),
        sa.Column("last_name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hash_password", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("document_type_id", sa.Integer(), nullable=False),
        sa.Column("document_number", sa.String(length=30), nullable=False),
        sa.Column("phone", sa.String(length=30), nullable=False),
        sa.Column("date_of_birth", sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(["document_type_id"], ["document_types.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_people_document_number", "people", ["document_number"], unique=True)
    op.create_index("ix_people_email", "people", ["email"], unique=True)
    op.create_table(
        "guardians",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("person_id", sa.Uuid(), nullable=False),
        sa.Column("relationship_type_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["person_id"], ["people.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["relationship_type_id"], ["relationship_types.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("person_id"),
    )
    op.create_table(
        "teachers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("person_id", sa.Uuid(), nullable=False),
        sa.Column("institution", sa.String(length=200), nullable=False),
        sa.ForeignKeyConstraint(["person_id"], ["people.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("person_id"),
    )
    op.create_table(
        "students",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("guardian_id", sa.Uuid(), nullable=False),
        sa.Column("first_name", sa.String(length=120), nullable=False),
        sa.Column("last_name", sa.String(length=120), nullable=False),
        sa.Column("date_of_birth", sa.Date(), nullable=False),
        sa.Column("hash_pin", sa.String(length=255), nullable=False),
        sa.Column("avatar", sa.String(length=60), nullable=False),
        sa.Column("support_condition", sa.String(length=500), nullable=True),
        sa.CheckConstraint("avatar IN ('avatar1', 'avatar2', 'avatar3', 'avatar4')", name="ck_students_avatar_valido"),
        sa.ForeignKeyConstraint(["guardian_id"], ["guardians.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_students_guardian_id", "students", ["guardian_id"])
    op.create_table(
        "consents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("guardian_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("policy_version", sa.String(length=20), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("authorizes_support_condition", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["guardian_id"], ["guardians.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("consents")
    op.drop_index("ix_students_guardian_id", table_name="students")
    op.drop_table("students")
    op.drop_table("teachers")
    op.drop_table("guardians")
    op.drop_index("ix_people_email", table_name="people")
    op.drop_index("ix_people_document_number", table_name="people")
    op.drop_table("people")
    op.drop_table("relationship_types")
    op.drop_table("document_types")
