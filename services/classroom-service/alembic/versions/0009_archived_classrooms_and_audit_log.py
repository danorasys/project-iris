"""classrooms.archived_at and classroom_audit_log

A teacher archives a class instead of deleting it right away (HU-105), and
only an archived class can be deleted (HU-85). What happens to each class
(created, archived, restored, deleted, left without teacher) goes to its own
table, with no foreign key so it outlives the class, and on PostgreSQL a
trigger refuses to change or delete its lines (ADR 0021).

The classes that already exist get their "created" line with the date they
were made, so every class has its log from the start.

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-09
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

_ACTIONS = "'created', 'archived', 'restored', 'deleted', 'teacher_left'"


def upgrade() -> None:
    op.add_column("classrooms", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "classroom_audit_log",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("classroom_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("student_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("pending_count", sa.Integer(), nullable=False, server_default="0"),
        sa.CheckConstraint(f"action IN ({_ACTIONS})", name="ck_classroom_audit_log_action"),
    )
    op.create_index(
        "ix_classroom_audit_log_classroom_occurred", "classroom_audit_log", ["classroom_id", "occurred_at"]
    )

    if op.get_bind().dialect.name == "postgresql":
        # Starting log of the classes already there, with their real date.
        op.execute(
            """
            INSERT INTO classroom_audit_log (id, classroom_id, action, actor_id, occurred_at)
            SELECT gen_random_uuid(), id, 'created', teacher_id, created_at FROM classrooms
            """
        )
        # Lines are only added: a change or a delete fails, even by mistake.
        op.execute(
            """
            CREATE FUNCTION classroom_audit_log_read_only() RETURNS trigger AS $$
            BEGIN
                RAISE EXCEPTION 'classroom_audit_log only accepts new lines';
            END;
            $$ LANGUAGE plpgsql
            """
        )
        op.execute(
            """
            CREATE TRIGGER classroom_audit_log_read_only
            BEFORE UPDATE OR DELETE ON classroom_audit_log
            FOR EACH ROW EXECUTE FUNCTION classroom_audit_log_read_only()
            """
        )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS classroom_audit_log_read_only ON classroom_audit_log")
        op.execute("DROP FUNCTION IF EXISTS classroom_audit_log_read_only()")
    op.drop_index("ix_classroom_audit_log_classroom_occurred", table_name="classroom_audit_log")
    op.drop_table("classroom_audit_log")
    op.drop_column("classrooms", "archived_at")
