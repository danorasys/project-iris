"""drop classrooms.logo_url, logo_key replaced it

Second step of migration 0002. The code only reads logo_key since then,
so the old column isn't needed anymore. After this, a deploy can't go back
to a version older than 0002 (it would still read the dropped column).

Going back down puts the column back and rebuilds the URL of every logo
from its logo_key, with the shape it had before 0002.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-03
"""
from __future__ import annotations

import os
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("classrooms", "logo_url")


def downgrade() -> None:
    op.add_column("classrooms", sa.Column("logo_url", sa.String(length=500), nullable=True))
    public_url = os.environ.get("S3_PUBLIC_URL", "http://localhost:9000").rstrip("/")
    bucket = os.environ.get("S3_BUCKET", "iris-media")
    prefix = f"{public_url}/{bucket}/".replace("'", "''")
    op.execute(f"UPDATE classrooms SET logo_url = '{prefix}' || logo_key WHERE logo_key IS NOT NULL")
