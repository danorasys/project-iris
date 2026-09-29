"""add image_file, the image's name inside its lesson's folder

The media bucket goes private: a lesson image is now only reachable through
GET /lessons/{id}/images/{file}, which checks the caller's session first.
So a block keeps just the file name ("<hex>.png"), and the key is always
rebuilt as "lessons/<lesson_id>/images/<file>". That also means a block can
only point at an image of its own lesson, never at an outside URL.

Expand step only: image_file is added and filled, image_url stays untouched.
A deploy rollback puts the previous image back without undoing migrations
(see docs/adr/0001-pull-based-deployment.md), and that image still reads
image_url. A later migration drops image_url once no deployed version uses it.

Existing rows hold full URLs like
"https://host/media/iris-media/lessons/<id>/images/<hex>.png". The file name
is the last part after "/images/". A value without that shape can't point at
a file this service uploaded, so its image_file stays NULL.

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-28
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("content_blocks", sa.Column("image_file", sa.String(length=64), nullable=True))
    # substring() returns NULL when the pattern doesn't match.
    op.execute(
        "UPDATE content_blocks SET image_file = substring(image_url from '/lessons/[^/]+/images/([^/]+)$') "
        "WHERE image_url IS NOT NULL"
    )


def downgrade() -> None:
    # Image blocks saved after the upgrade only have image_file, so they're lost here.
    op.drop_column("content_blocks", "image_file")
