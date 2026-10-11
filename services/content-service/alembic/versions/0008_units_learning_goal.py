"""units.learning_goal: what the kids should manage after the whole unit

Each lesson already has its expected performance (lessons.learning_goal);
the unit gets its own, for the whole set of its lessons, like the MEN
sequences, which set expected performances per sequence. The API requires it
for new units and doesn't let it be cleared.

The units already there can't be guessed, so they start empty (''): a lesson
of such a unit can't be published until its teacher writes it, and the
editor shows that it's missing. That's why the column needs no second step.

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-10
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
    op.add_column("units", sa.Column("learning_goal", sa.String(300), nullable=False, server_default=""))
    # Only the rows already there get '', a new unit always brings its own.
    op.alter_column("units", "learning_goal", server_default=None)


def downgrade() -> None:
    op.drop_column("units", "learning_goal")
