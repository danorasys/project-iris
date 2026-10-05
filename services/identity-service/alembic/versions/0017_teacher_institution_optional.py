"""teachers.institution is optional

HU-65 always said the institution was optional (a tutor who gives private
classes has none), but the column was NOT NULL. Now it can be empty.

Going back down fills the empty ones with an empty text, the old column
didn't allow NULL.

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-03
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("teachers", "institution", existing_type=sa.String(length=200), nullable=True)


def downgrade() -> None:
    op.execute("UPDATE teachers SET institution = '' WHERE institution IS NULL")
    op.alter_column("teachers", "institution", existing_type=sa.String(length=200), nullable=False)
