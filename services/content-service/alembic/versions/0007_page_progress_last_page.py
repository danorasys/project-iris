"""page_progress.last_page: the page where the kid left the lesson

pages_seen is the furthest page they ever reached (their progress, which
never goes back). To take them back to the exact page where they left
(HU-62), even when they went back to read something again, the last page
they were on is kept apart. Rows from before start at their furthest page.

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-08
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("page_progress", sa.Column("last_page", sa.Integer(), nullable=False, server_default="0"))
    op.execute("UPDATE page_progress SET last_page = pages_seen")
    op.create_check_constraint("ck_page_progress_last_page", "page_progress", "last_page >= 0")


def downgrade() -> None:
    op.drop_constraint("ck_page_progress_last_page", "page_progress", type_="check")
    op.drop_column("page_progress", "last_page")
