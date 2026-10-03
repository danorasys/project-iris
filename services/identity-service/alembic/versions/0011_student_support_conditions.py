"""let a student have several support conditions

A kid often has more than one condition (mielomeningocele together with
Arnold Chiari, for example), but students.support_condition_id only holds
one. The conditions now live in student_support_conditions, one row per
student and condition. The pair is the primary key, so a condition can't be
repeated on the same student, and that same key is what finds the conditions
of a student (student_id goes first). No other index: nothing searches by
condition yet.

The condition each student already had is copied to the new table.

students.support_condition_id stays in this step, only nullable. The next
migration (0012) drops it.

Going back down keeps only one condition per student (the one with the
lowest id), the rest is lost.

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-01
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "student_support_conditions",
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("support_condition_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["support_condition_id"], ["support_conditions.id"]),
        sa.PrimaryKeyConstraint("student_id", "support_condition_id"),
    )
    op.execute(
        """
        INSERT INTO student_support_conditions (student_id, support_condition_id)
        SELECT id, support_condition_id FROM students WHERE support_condition_id IS NOT NULL
        """
    )
    op.alter_column("students", "support_condition_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    # The old column comes back empty from the downgrade of 0012, so it is
    # filled here from the new table.
    op.execute(
        """
        UPDATE students
        SET support_condition_id = (
            SELECT MIN(support_condition_id)
            FROM student_support_conditions
            WHERE student_support_conditions.student_id = students.id
        )
        WHERE EXISTS (
            SELECT 1 FROM student_support_conditions WHERE student_support_conditions.student_id = students.id
        )
        """
    )
    op.alter_column("students", "support_condition_id", existing_type=sa.Integer(), nullable=False)
    op.drop_table("student_support_conditions")
