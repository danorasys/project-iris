"""add logo_key, the logo's place in the private bucket

The media bucket goes private: a logo is now only reachable through
GET /classrooms/{id}/logo/{file}, which checks the caller's session first.
So the code keeps where the file lives inside the bucket
("classrooms/<id>/logo/<hex>.png") instead of a URL anybody could open.

Expand step only: logo_key is added and filled, logo_url stays untouched.
A deploy rollback puts the previous image back without undoing migrations
(see docs/adr/0001-pull-based-deployment.md), and that image still reads
logo_url. A later migration drops logo_url once no deployed version uses it.

Existing rows hold full URLs like
"https://host/media/iris-media/classrooms/<id>/logo/<hex>.png". The key is
everything from "classrooms/" on. A value without that shape can't point at
a file this service uploaded, so its key stays NULL.

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
    op.add_column("classrooms", sa.Column("logo_key", sa.String(length=500), nullable=True))
    # substring() returns NULL when the pattern doesn't match.
    op.execute("UPDATE classrooms SET logo_key = substring(logo_url from '(classrooms/.+)$') WHERE logo_url IS NOT NULL")


def downgrade() -> None:
    # Logos uploaded after the upgrade only exist in logo_key, so they're lost here.
    op.drop_column("classrooms", "logo_key")
