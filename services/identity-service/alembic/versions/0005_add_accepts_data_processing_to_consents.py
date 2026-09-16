"""add accepts_data_processing to consents

The registration form has always required checking "Acepto el tratamiento de
mis datos..." before creating an account (ConsentDataRequest rejects the
request otherwise), but that acceptance was only checked at the API boundary
and then discarded — the consents table never stored it, only
authorizes_support_condition. This adds the missing column so there's an
actual record of that consent per guardian/student pair, not just proof it
was required at submission time.

Existing rows all came from a registration that already passed that same
validation, so they get backfilled to true.

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-13
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("consents", sa.Column("accepts_data_processing", sa.Boolean(), nullable=True))
    op.execute("UPDATE consents SET accepts_data_processing = true")
    op.alter_column("consents", "accepts_data_processing", nullable=False)


def downgrade() -> None:
    op.drop_column("consents", "accepts_data_processing")
