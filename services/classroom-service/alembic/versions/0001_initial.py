"""initial schema: classrooms, enrollments

Squashed from the service's earlier incremental migrations into one, now
that the schema itself has settled. Matches the current SQLAlchemy models
exactly.

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
        "classrooms",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("teacher_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=False),
        sa.Column("logo_url", sa.String(length=500), nullable=True),
        sa.Column("enrollment_code", sa.String(length=7), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_classrooms_enrollment_code", "classrooms", ["enrollment_code"], unique=True)
    op.create_index("ix_classrooms_teacher_id", "classrooms", ["teacher_id"])
    op.create_table(
        "enrollments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("classroom_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["classroom_id"], ["classrooms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("student_id", "classroom_id", name="uq_enrollment_student_classroom"),
    )
    op.create_index("ix_enrollments_classroom_status", "enrollments", ["classroom_id", "status"])
    op.create_index("ix_enrollments_student_id", "enrollments", ["student_id"])


def downgrade() -> None:
    op.drop_index("ix_enrollments_student_id", table_name="enrollments")
    op.drop_index("ix_enrollments_classroom_status", table_name="enrollments")
    op.drop_table("enrollments")
    op.drop_index("ix_classrooms_teacher_id", table_name="classrooms")
    op.drop_index("ix_classrooms_enrollment_code", table_name="classrooms")
    op.drop_table("classrooms")
