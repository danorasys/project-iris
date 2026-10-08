"""avatars.accent_color: the main color of each avatar

The parents' portal paints each kid's banner with the color of their avatar.
That color belongs to the avatar, so it lives in the catalog: a new avatar
brings its own, without touching the code. The four first ones take the
background color of their image.

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-07
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# Written out here instead of imported from the app, so this migration keeps
# meaning the same thing even if the catalog changes later.
_COLORS = {
    "Violeta": "#804890",
    "Coral": "#c06048",
    "Bosque": "#68a868",
    "Cielo": "#70b8f0",
}
# Any other avatar already there gets the IRIS blue until someone picks its color.
_DEFAULT = "#1f62bf"


def upgrade() -> None:
    op.add_column("avatars", sa.Column("accent_color", sa.String(length=7), nullable=True))
    avatars = sa.table("avatars", sa.column("name", sa.String), sa.column("accent_color", sa.String))
    for name, color in _COLORS.items():
        op.execute(avatars.update().where(avatars.c.name == name).values(accent_color=color))
    op.execute(avatars.update().where(avatars.c.accent_color.is_(None)).values(accent_color=_DEFAULT))
    op.alter_column("avatars", "accent_color", nullable=False)
    # Only "#" and six lowercase hex digits, the way the web app uses it.
    op.create_check_constraint("ck_avatars_accent_color", "avatars", "accent_color ~ '^#[0-9a-f]{6}$'")


def downgrade() -> None:
    op.drop_constraint("ck_avatars_accent_color", "avatars", type_="check")
    op.drop_column("avatars", "accent_color")
