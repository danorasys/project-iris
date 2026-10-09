"""page_progress and activity_attempts: what a kid has done in a lesson

Until now a kid left no trace in a lesson. The parents' portal shows how
far each kid got (HU-46) and every try at the activities (HU-47), so:

- page_progress: the furthest page a kid reached in a lesson (extra_id
  NULL) or in one of its extras. One row per kid and part, kept by two
  unique indexes (a partial one for the lesson itself, like activities).
- activity_attempts: every try, with how many right answers out of how many
  and whether it passed. It hangs from the lesson and the extra, never from
  the activity, because saving an activity replaces it and the record of
  the tries has to stay.

Both go away with their lesson or extra (ON DELETE CASCADE).

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-08
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "page_progress",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("lesson_id", sa.Uuid(), nullable=False),
        sa.Column("extra_id", sa.Uuid(), nullable=True),
        sa.Column("pages_seen", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("pages_seen >= 0", name="ck_page_progress_pages_seen"),
        sa.ForeignKeyConstraint(["lesson_id"], ["lessons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["extra_id"], ["extras.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_page_progress_lesson",
        "page_progress",
        ["student_id", "lesson_id"],
        unique=True,
        postgresql_where=sa.text("extra_id IS NULL"),
    )
    op.create_index("uq_page_progress_extra", "page_progress", ["student_id", "extra_id"], unique=True)

    op.create_table(
        "activity_attempts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("lesson_id", sa.Uuid(), nullable=False),
        sa.Column("extra_id", sa.Uuid(), nullable=True),
        sa.Column("correct", sa.Integer(), nullable=False),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column("passed", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("total >= 1 AND correct >= 0 AND correct <= total", name="ck_activity_attempts_score"),
        sa.ForeignKeyConstraint(["lesson_id"], ["lessons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["extra_id"], ["extras.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_activity_attempts_student_lesson", "activity_attempts", ["student_id", "lesson_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_activity_attempts_student_lesson", table_name="activity_attempts")
    op.drop_table("activity_attempts")
    op.drop_index("uq_page_progress_extra", table_name="page_progress")
    op.drop_index("uq_page_progress_lesson", table_name="page_progress")
    op.drop_table("page_progress")
