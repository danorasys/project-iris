"""classrooms.description: up to 2000 characters

The description of a classroom grows from 1000 to 2000 characters, so a
teacher has room to say what the class is about and what the kids will
learn in it. On PostgreSQL making a varchar longer only changes the
catalog, the rows aren't rewritten. Going back cuts the longer ones to
1000 characters, the old limit.

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-05
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
    op.alter_column(
        "classrooms",
        "description",
        existing_type=sa.String(length=1000),
        type_=sa.String(length=2000),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "classrooms",
        "description",
        existing_type=sa.String(length=2000),
        type_=sa.String(length=1000),
        existing_nullable=False,
        postgresql_using="left(description, 1000)",
    )
