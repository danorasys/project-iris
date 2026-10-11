"""units.learning_goal goes away: the DBA of the unit says its goal

Migration 0008 gave each unit its own expected performance. Since 0009 the
unit has its DBA with its Evidencias de Aprendizaje, which say almost the
same thing, so families read it twice. The goal of each lesson stays
(lessons.learning_goal), that one is smaller and different.

Going back brings the column again empty (''), like 0008 left the units it
found.

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-11
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("units", "learning_goal")


def downgrade() -> None:
    op.add_column("units", sa.Column("learning_goal", sa.String(300), nullable=False, server_default=""))
    op.alter_column("units", "learning_goal", server_default=None)
