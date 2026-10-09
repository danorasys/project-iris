"""notifications for lessons, kids' reports and the teacher's messages

Three new kinds of notification (Fase 2 of the plan):

- A new lesson, or a new extra of a published one (HU-83), for each kid of
  the class and their guardian: lesson_id, lesson_title and extra_title.
- What a kid finished, for their teacher (HU-69): the lesson, and the score
  of the first try at its activity (score_correct of score_total).
- The teacher's message to a kid or to their guardian (HU-77): it uses
  subject and body like a guardian's, and addressee says to whom it went,
  for the copy that stays in the teacher's tray.

Kids now have a tray too (recipient_role "student"). Everything is
nullable, the older kinds don't use any of it.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-08
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("notifications", sa.Column("lesson_id", sa.Uuid(), nullable=True))
    op.add_column("notifications", sa.Column("lesson_title", sa.String(length=200), nullable=True))
    op.add_column("notifications", sa.Column("extra_title", sa.String(length=200), nullable=True))
    op.add_column("notifications", sa.Column("score_correct", sa.Integer(), nullable=True))
    op.add_column("notifications", sa.Column("score_total", sa.Integer(), nullable=True))
    op.add_column("notifications", sa.Column("addressee", sa.String(length=20), nullable=True))


def downgrade() -> None:
    for column in ("addressee", "score_total", "score_correct", "extra_title", "lesson_title", "lesson_id"):
        op.drop_column("notifications", column)
