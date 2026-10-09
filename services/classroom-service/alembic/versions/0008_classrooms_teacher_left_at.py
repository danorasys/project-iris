"""classrooms.teacher_left_at: the class stays when its teacher leaves IRIS

A teacher can delete their account without deleting their classes (HU-92):
the kids already in them keep their lessons and their progress. The class
remembers when its teacher left; from then on it takes no new requests,
nobody can edit or answer it, and its families see it has no teacher.

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-08
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("classrooms", sa.Column("teacher_left_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("classrooms", "teacher_left_at")
