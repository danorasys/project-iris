"""add totp_secret and totp_enabled to guardians

Adds two-factor authentication (2FA) support for guardian accounts, using
TOTP (RFC 6238) via an authenticator app (Google Authenticator, Microsoft
Authenticator, Authy, or any other app implementing the same open standard).

totp_secret is nullable and stays NULL until a guardian starts setup; it's
encrypted at rest by the application layer (see infrastructure/security.py's
FernetTotpEncryptor), never stored in plain text, so this migration only
needs to know it's text, not what's inside it. totp_enabled defaults to
false for every existing and new row: 2FA setup only flips it to true once
a real code from the guardian's app has been verified, never just because a
secret exists (see TotpService.setup vs .verify) — otherwise a guardian who
generated a QR but never actually scanned it would be silently "protected"
by a factor they never configured.

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-14
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("guardians", sa.Column("totp_secret", sa.Text(), nullable=True))
    op.add_column(
        "guardians",
        sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    # The server_default above only exists so the ADD COLUMN succeeds against
    # existing rows; drop it afterward so future inserts rely on the ORM's
    # own default (see GuardianModel.totp_enabled) instead of two sources of
    # truth for the same default drifting apart later.
    op.alter_column("guardians", "totp_enabled", server_default=None)


def downgrade() -> None:
    op.drop_column("guardians", "totp_enabled")
    op.drop_column("guardians", "totp_secret")
