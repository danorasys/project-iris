"""indexes by teacher for the Inicio of the teacher's portal

GET /content/teachers/me/content-summary counts the units and lessons of
one teacher, grouped by classroom (and by status in lessons). The indexes
we had start with classroom_id, so Postgres had to go through every row of
every teacher and throw away the ones that weren't theirs. These start with
teacher_id and carry the grouped columns, so it only reads that teacher's.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-07
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_units_teacher_classroom", "units", ["teacher_id", "classroom_id"])
    op.create_index("ix_lessons_teacher_classroom_status", "lessons", ["teacher_id", "classroom_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_lessons_teacher_classroom_status", table_name="lessons")
    op.drop_index("ix_units_teacher_classroom", table_name="units")
