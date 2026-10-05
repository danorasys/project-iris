"""drop avatars.image_path, image_key replaced it

Second step of migration 0008. The code only reads image_key since then,
so the old column isn't needed anymore. After this, a deploy can't go back
to a version older than 0008 (it would still read the dropped column).

Going back down puts the column back and rebuilds each URL from image_key,
the same way 0008's downgrade does.

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-03
"""
from __future__ import annotations

import os
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("avatars", "image_path")


def downgrade() -> None:
    op.add_column("avatars", sa.Column("image_path", sa.Text(), nullable=True))
    public_url = os.environ.get("S3_PUBLIC_URL", "http://localhost:9000").rstrip("/")
    bucket = os.environ.get("S3_BUCKET", "iris-media")
    prefix = f"{public_url}/{bucket}/".replace("'", "''")
    op.execute(f"UPDATE avatars SET image_path = '{prefix}' || image_key")
