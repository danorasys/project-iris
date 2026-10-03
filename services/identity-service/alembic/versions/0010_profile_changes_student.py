"""add student_id to profile_changes, for changes a guardian makes to a kid's profile

A guardian can now edit the data of their kids from the parents' portal.
Those changes are recorded in the same table as the guardian's own: person_id
is still who made the change, and the new student_id says which kid it was
about (empty when the guardian changed their own profile).

The index is for deleting a kid: Postgres has to find their rows to delete
them too (ON DELETE CASCADE), and without it that reads the whole table.

Only a new nullable column, the code before this migration ignores it, so a
deploy rollback keeps working (see docs/adr/0001-pull-based-deployment.md).

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-01
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("profile_changes", sa.Column("student_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "profile_changes_student_id_fkey", "profile_changes", "students", ["student_id"], ["id"], ondelete="CASCADE"
    )
    op.create_index("ix_profile_changes_student_id", "profile_changes", ["student_id"])


def downgrade() -> None:
    op.drop_index("ix_profile_changes_student_id", table_name="profile_changes")
    op.drop_constraint("profile_changes_student_id_fkey", "profile_changes", type_="foreignkey")
    op.drop_column("profile_changes", "student_id")
