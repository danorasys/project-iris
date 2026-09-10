"""initial schema: lessons, content_blocks

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
        "lessons",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("classroom_id", sa.Uuid(), nullable=False),
        sa.Column("teacher_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lessons_classroom_status", "lessons", ["classroom_id", "status"])
    op.create_index("ix_lessons_classroom_teacher", "lessons", ["classroom_id", "teacher_id"])
    op.create_table(
        "content_blocks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("lesson_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("image_url", sa.String(length=1000), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["lesson_id"], ["lessons.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_content_blocks_lesson_order", "content_blocks", ["lesson_id", "order_index"])


def downgrade() -> None:
    op.drop_index("ix_content_blocks_lesson_order", table_name="content_blocks")
    op.drop_table("content_blocks")
    op.drop_index("ix_lessons_classroom_teacher", table_name="lessons")
    op.drop_index("ix_lessons_classroom_status", table_name="lessons")
    op.drop_table("lessons")
