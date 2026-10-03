"""notifications for guardians too, with the kid, the classroom and the sender

Until now every notification was for a teacher. Guardians get their own
ones about their kids' requests to join a classroom, so teacher_id becomes
recipient_id plus recipient_role ("teacher" or "guardian"). Every existing
row was a teacher's.

The new columns keep a copy of what the tray shows (the kid, the name of
the classroom and who it's from), taken from the event when it arrives, so
listing the tray never has to ask the other services.

The index follows the new query: one person's tray, newest first.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-03
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
    op.drop_index("ix_notifications_teacher_created", table_name="notifications")
    op.alter_column("notifications", "teacher_id", new_column_name="recipient_id", existing_type=sa.Uuid())
    op.add_column(
        "notifications",
        sa.Column("recipient_role", sa.String(length=20), nullable=False, server_default="teacher"),
    )
    # The default was only to fill the existing rows, the code always sets it.
    op.alter_column("notifications", "recipient_role", server_default=None, existing_type=sa.String(length=20))
    op.add_column("notifications", sa.Column("student_id", sa.Uuid(), nullable=True))
    op.add_column("notifications", sa.Column("classroom_name", sa.String(length=120), nullable=True))
    op.add_column("notifications", sa.Column("sender_name", sa.String(length=255), nullable=True))
    op.create_index(
        "ix_notifications_recipient_created", "notifications", ["recipient_id", "recipient_role", "created_at"]
    )


def downgrade() -> None:
    # The guardians' notifications have nowhere to go in the old table.
    op.execute("DELETE FROM notifications WHERE recipient_role <> 'teacher'")
    op.drop_index("ix_notifications_recipient_created", table_name="notifications")
    op.drop_column("notifications", "sender_name")
    op.drop_column("notifications", "classroom_name")
    op.drop_column("notifications", "student_id")
    op.drop_column("notifications", "recipient_role")
    op.alter_column("notifications", "recipient_id", new_column_name="teacher_id", existing_type=sa.Uuid())
    op.create_index("ix_notifications_teacher_created", "notifications", ["teacher_id", "created_at"])
