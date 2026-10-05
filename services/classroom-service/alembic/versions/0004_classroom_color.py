"""classrooms.color: the color of the classroom's avatar

The avatar of a classroom is the initials of its name on a color the
teacher picks (HU-73), unless they upload their own image. Only the color
is stored, the initials come from the name. The CHECK keeps the same five
colors the API accepts. Existing classrooms get the default, blue.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-04
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

COLORS_SQL = "'blue', 'navy', 'orange', 'green', 'gold'"


def upgrade() -> None:
    op.add_column(
        "classrooms",
        sa.Column("color", sa.String(length=10), nullable=False, server_default="blue"),
    )
    op.create_check_constraint("ck_classrooms_color", "classrooms", f"color IN ({COLORS_SQL})")


def downgrade() -> None:
    op.drop_constraint("ck_classrooms_color", "classrooms", type_="check")
    op.drop_column("classrooms", "color")
