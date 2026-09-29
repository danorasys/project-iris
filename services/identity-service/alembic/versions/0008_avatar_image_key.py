"""add image_key, the avatar's place in the public bucket

Avatars move to their own public bucket (iris-public), separate from the
private one that keeps what users upload. The code now keeps where the
image lives inside that bucket ("avatars/avatar-1.png"), and the API builds
the URL from PUBLIC_MEDIA_URL. Changing the domain or the storage later is
then a config change, not a data change.

Expand step only: image_key is added and filled, image_path stays (now
nullable, new rows don't need it). A deploy rollback puts the previous image
back without undoing migrations (see docs/adr/0001-pull-based-deployment.md),
and that image still reads image_path. A later migration drops image_path
once no deployed version uses it.

Existing rows hold full URLs like
"http://localhost:9000/iris-media/avatars/avatar-1.png". The key is
everything from "avatars/" on.

Adding an avatar from now on: upload the file to iris-public under
avatars/, then insert a row here with its name and image_key.

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-28
"""
from __future__ import annotations

import os
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("avatars", sa.Column("image_key", sa.Text(), nullable=True))
    op.execute("UPDATE avatars SET image_key = coalesce(substring(image_path from '(avatars/.+)$'), image_path)")
    op.alter_column("avatars", "image_key", nullable=False)
    op.alter_column("avatars", "image_path", nullable=True)


def downgrade() -> None:
    # Avatars added after the upgrade have no image_path, so it's rebuilt the
    # way migration 0006 built it (students may point at them, deleting them
    # isn't an option).
    public_url = os.environ.get("S3_PUBLIC_URL", "http://localhost:9000").rstrip("/")
    bucket = os.environ.get("S3_BUCKET", "iris-media")
    prefix = f"{public_url}/{bucket}/".replace("'", "''")
    op.execute(f"UPDATE avatars SET image_path = '{prefix}' || image_key WHERE image_path IS NULL")
    op.alter_column("avatars", "image_path", nullable=False)
    op.drop_column("avatars", "image_key")
