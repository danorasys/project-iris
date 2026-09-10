"""initial schema: notifications

Squashed from the service's earlier incremental migrations into one, now
that the schema itself has settled. Matches the current SQLAlchemy models
exactly.

Revision ID: 0001
Revises:
Create Date: 2026-09-10
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("teacher_id", sa.Uuid(), nullable=False),
        sa.Column("event", sa.String(length=40), nullable=False),
        sa.Column("classroom_id", sa.Uuid(), nullable=False),
        sa.Column("enrollment_id", sa.Uuid(), nullable=False),
        sa.Column("student_name", sa.String(length=120), nullable=True),
        sa.Column("decision", sa.String(length=20), nullable=True),
        sa.Column("read", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notifications_teacher_created", "notifications", ["teacher_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_notifications_teacher_created", table_name="notifications")
    op.drop_table("notifications")
