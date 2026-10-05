"""teacher profile: about me, studies and experience

What a teacher tells the families about themselves (HU-96). All optional,
filled in at registration or later from their panel.

- teacher_studies / teacher_experiences: one row per entry, in the order
  the teacher gave them (position). The unique (teacher_id, position) is
  the index that lists them, no other index is needed.
- teachers.about: the short presentation.

Nothing is copied: no teacher had a profile before. Going back down deletes
the profiles.

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-03
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

STUDY_LEVELS_SQL = "'technical', 'technologist', 'professional', 'specialization', 'masters', 'doctorate'"


def upgrade() -> None:
    op.add_column("teachers", sa.Column("about", sa.String(length=2000), nullable=True))

    op.create_table(
        "teacher_studies",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("teacher_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column("level", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=150), nullable=False),
        sa.Column("institution", sa.String(length=150), nullable=False),
        sa.Column("ended_on", sa.Date(), nullable=True),
        sa.Column("in_progress", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["teacher_id"], ["teachers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("teacher_id", "position", name="uq_teacher_studies_teacher_position"),
        sa.CheckConstraint(f"level IN ({STUDY_LEVELS_SQL})", name="ck_teacher_studies_level"),
        sa.CheckConstraint(
            "(in_progress AND ended_on IS NULL) OR (NOT in_progress AND ended_on IS NOT NULL)",
            name="ck_teacher_studies_ended_on",
        ),
    )

    op.create_table(
        "teacher_experiences",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("teacher_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column("role", sa.String(length=150), nullable=False),
        sa.Column("place", sa.String(length=150), nullable=False),
        sa.Column("started_on", sa.Date(), nullable=False),
        sa.Column("ended_on", sa.Date(), nullable=True),
        sa.Column("description", sa.String(length=2000), nullable=True),
        sa.ForeignKeyConstraint(["teacher_id"], ["teachers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("teacher_id", "position", name="uq_teacher_experiences_teacher_position"),
        sa.CheckConstraint("ended_on IS NULL OR ended_on >= started_on", name="ck_teacher_experiences_dates"),
    )


def downgrade() -> None:
    op.drop_table("teacher_experiences")
    op.drop_table("teacher_studies")
    op.drop_column("teachers", "about")
