"""add profile_changes, the record of the changes each person makes to their profile

Each time a guardian saves changes to their own profile, one row is added:
who (person_id), from which session, when, which fields changed and which
version of the "the information I changed is correct and true" declaration
they accepted (PROFILE_DECLARATION_VERSION in app/domain/entities.py).

Only the names of the fields are saved, never their values, so this table
isn't one more copy of personal data. Rows are only added, and they are
deleted together with the person.

Only a new table, nothing existing changes, so a deploy rollback leaves it
unused and harmless (see docs/adr/0001-pull-based-deployment.md).

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-01
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "profile_changes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("person_id", sa.Uuid(), sa.ForeignKey("people.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", sa.String(64), nullable=True),
        sa.Column("changed_fields", sa.JSON(), nullable=False),
        sa.Column("declaration_version", sa.String(20), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_profile_changes_person_changed_at", "profile_changes", ["person_id", "changed_at"])


def downgrade() -> None:
    op.drop_index("ix_profile_changes_person_changed_at", table_name="profile_changes")
    op.drop_table("profile_changes")
