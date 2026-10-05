"""teacher_consents: the teacher's acceptance of the data treatment

A guardian accepts the treatment of their data and their kid's at
registration (consents). A teacher now does the same with their own data
(Ley 1581 de 2012): one row per acceptance, with the version of the privacy
policy they saw and when. It goes away with the teacher.

Teachers registered before this have no row: they never saw the checkbox.

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-03
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "teacher_consents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("teacher_id", sa.Uuid(), nullable=False),
        sa.Column("policy_version", sa.String(length=20), nullable=False),
        sa.Column("accepts_data_processing", sa.Boolean(), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["teacher_id"], ["teachers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_teacher_consents_teacher_id", "teacher_consents", ["teacher_id"])


def downgrade() -> None:
    op.drop_index("ix_teacher_consents_teacher_id", table_name="teacher_consents")
    op.drop_table("teacher_consents")
