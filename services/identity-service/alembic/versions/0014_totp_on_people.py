"""move the 2FA (TOTP) from guardians to people

Until now only guardians had 2FA, so the secret lived in guardians. Teachers
get it too (ADR 0010), and the code belongs to the account, not to the role,
so totp_secret and totp_enabled move to people. Every guardian keeps their
secret and whether it was on: it's copied as it is, still encrypted.

Going back down copies them back to guardians. A teacher's 2FA has nowhere
to go in the old schema and is lost.

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-03
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("people", sa.Column("totp_secret", sa.Text(), nullable=True))
    op.add_column(
        "people", sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default=sa.false())
    )
    op.execute(
        """
        UPDATE people
        SET totp_secret = guardians.totp_secret, totp_enabled = guardians.totp_enabled
        FROM guardians
        WHERE guardians.person_id = people.id
        """
    )
    # The default was only to fill the existing rows, the code always sets it.
    op.alter_column("people", "totp_enabled", server_default=None, existing_type=sa.Boolean())
    op.drop_column("guardians", "totp_enabled")
    op.drop_column("guardians", "totp_secret")


def downgrade() -> None:
    op.add_column("guardians", sa.Column("totp_secret", sa.Text(), nullable=True))
    op.add_column(
        "guardians", sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default=sa.false())
    )
    op.execute(
        """
        UPDATE guardians
        SET totp_secret = people.totp_secret, totp_enabled = people.totp_enabled
        FROM people
        WHERE people.id = guardians.person_id
        """
    )
    op.alter_column("guardians", "totp_enabled", server_default=None, existing_type=sa.Boolean())
    op.drop_column("people", "totp_enabled")
    op.drop_column("people", "totp_secret")
