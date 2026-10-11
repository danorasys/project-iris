"""notifications.subject and body: longer messages, like an email

A message between a family and a teacher can now have a subject of up to
300 characters and a body of up to 20000 (before 120 and 2000), the same
sizes classroom-service checks. Making a varchar wider doesn't rewrite the
table in PostgreSQL.

Going back cuts what doesn't fit, so the old sizes hold again.

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-10
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("notifications", "subject", type_=sa.String(300), existing_type=sa.String(120))
    op.alter_column("notifications", "body", type_=sa.String(20000), existing_type=sa.String(2000))


def downgrade() -> None:
    op.alter_column(
        "notifications",
        "subject",
        type_=sa.String(120),
        existing_type=sa.String(300),
        postgresql_using="left(subject, 120)",
    )
    op.alter_column(
        "notifications",
        "body",
        type_=sa.String(2000),
        existing_type=sa.String(20000),
        postgresql_using="left(body, 2000)",
    )
