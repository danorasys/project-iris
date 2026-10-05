"""drop content_blocks.image_url, image_file replaced it

Second step of migration 0002. The code only reads image_file since then,
so the old column isn't needed anymore. After this, a deploy can't go back
to a version older than 0002 (it would still read the dropped column).

Going back down puts the column back and rebuilds the URL of every image
block from its lesson and image_file, with the shape it had before 0002.

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
    op.drop_column("content_blocks", "image_url")


def downgrade() -> None:
    op.add_column("content_blocks", sa.Column("image_url", sa.String(length=1000), nullable=True))
    public_url = os.environ.get("S3_PUBLIC_URL", "http://localhost:9000").rstrip("/")
    bucket = os.environ.get("S3_BUCKET", "iris-media")
    prefix = f"{public_url}/{bucket}/lessons/".replace("'", "''")
    op.execute(
        f"UPDATE content_blocks SET image_url = '{prefix}' || lesson_id || '/images/' || image_file "
        "WHERE image_file IS NOT NULL"
    )
