"""session_history: one row per sign-in of a guardian or a teacher

The session id lived only in the tokens and, for closed sessions, a while in
Redis, so profile_changes.session_id had nothing to be checked against. This
table keeps each sign-in: who, as what, when it started, when it was last
used, how it ended, and the browser and system families (never the full
User-Agent nor the IP address).

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-05
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# Written out here instead of imported from the app, so this migration keeps
# meaning the same thing even if those lists change later.
_ROLES = "'guardian', 'teacher'"
_END_REASONS = "'logout', 'user_request', 'password_changed', 'refresh_token_reuse', 'portal_2fa_repeated_lock'"


def upgrade() -> None:
    op.create_table(
        "session_history",
        sa.Column("session_id", sa.String(length=64), primary_key=True),
        sa.Column("person_id", sa.Uuid(), sa.ForeignKey("people.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(length=10), nullable=False),
        sa.Column("browser", sa.String(length=30), nullable=True),
        sa.Column("operating_system", sa.String(length=30), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_reason", sa.String(length=30), nullable=True),
        sa.CheckConstraint(f"role IN ({_ROLES})", name="ck_session_history_role"),
        sa.CheckConstraint(
            f"end_reason IS NULL OR end_reason IN ({_END_REASONS})", name="ck_session_history_end_reason"
        ),
        sa.CheckConstraint("(ended_at IS NULL) = (end_reason IS NULL)", name="ck_session_history_ended"),
    )
    op.create_index("ix_session_history_person_started_at", "session_history", ["person_id", "started_at"])


def downgrade() -> None:
    op.drop_index("ix_session_history_person_started_at", table_name="session_history")
    op.drop_table("session_history")
