"""notifications.thread_id: the messages of one conversation (HU-51)

A message (a guardian's to the teacher, or the teacher's to a kid or a
guardian) belongs to a thread. Answering one keeps its thread, so the
conversation reads in order like an email one. Each person sees the thread
through their own tray, so the one who writes now keeps a copy too.

The index serves opening a thread inside one person's tray.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-08
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("notifications", sa.Column("thread_id", sa.Uuid(), nullable=True))
    op.create_index("ix_notifications_recipient_thread", "notifications", ["recipient_id", "thread_id"])


def downgrade() -> None:
    op.drop_index("ix_notifications_recipient_thread", table_name="notifications")
    op.drop_column("notifications", "thread_id")
