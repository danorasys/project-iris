"""notifications.subject and body: a guardian's message to a teacher

A guardian can write to the teacher of their kid's class from the parents'
portal (HU-48), and the message is kept in the teacher's tray as one more
notification. Only those have a subject and a body, so both are nullable.

No new index: the space of a class filters by classroom and kid inside one
person's tray, which ix_notifications_recipient_created already narrows to
a few rows.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-08
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("notifications", sa.Column("subject", sa.String(length=120), nullable=True))
    op.add_column("notifications", sa.Column("body", sa.String(length=2000), nullable=True))


def downgrade() -> None:
    op.drop_column("notifications", "body")
    op.drop_column("notifications", "subject")
