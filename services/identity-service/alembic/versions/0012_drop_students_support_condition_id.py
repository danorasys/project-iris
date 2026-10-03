"""drop students.support_condition_id, the conditions live in their own table

Since 0011 the conditions of a student are in student_support_conditions.
The old column was only kept one step longer, and nothing reads it anymore.
Dropping the column also drops its foreign key.

After this migration the version of the service from before 0011 can't run
against this database: it expects the column. Going back to it means
downgrading the database too (which keeps only one condition per student, the
one with the lowest id).

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-01
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("students", "support_condition_id")


def downgrade() -> None:
    # Back as it was after 0011: nullable, with the same foreign key name,
    # and filled with the first condition of each student.
    op.add_column("students", sa.Column("support_condition_id", sa.Integer(), nullable=True))
    op.execute(
        """
        UPDATE students
        SET support_condition_id = (
            SELECT MIN(support_condition_id)
            FROM student_support_conditions
            WHERE student_support_conditions.student_id = students.id
        )
        """
    )
    op.create_foreign_key(
        "fk_students_support_condition_id", "students", "support_conditions", ["support_condition_id"], ["id"]
    )
