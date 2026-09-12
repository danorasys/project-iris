"""split people.phone into phone_country_code and phone_number

The guardian form's country-flag selector already knows the calling code and
the national number as two separate values; storing them as one combined
E.164 string meant the only way to answer "what country is this person in"
was to re-parse that string. Splitting them removes that need entirely.

Backfill assumption: every row in this pre-launch database is a Colombian
number, either in the old bare 10-digit teacher format ("3001234567") or in
the E.164 format guardian registration briefly used ("+573001234567") before
this migration. A production migration with real international data would
need a proper phone-number library for the backfill instead of this
single-country shortcut.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-11
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

_DEFAULT_COUNTRY_CODE = "57"


def upgrade() -> None:
    op.add_column("people", sa.Column("phone_country_code", sa.String(3), nullable=True))
    op.add_column("people", sa.Column("phone_number", sa.String(15), nullable=True))

    op.execute(
        f"""
        UPDATE people
        SET
            phone_country_code = '{_DEFAULT_COUNTRY_CODE}',
            phone_number = CASE
                WHEN phone LIKE '+%' THEN regexp_replace(phone, '^\\+{_DEFAULT_COUNTRY_CODE}', '')
                ELSE phone
            END
        """
    )

    op.alter_column("people", "phone_country_code", nullable=False)
    op.alter_column("people", "phone_number", nullable=False)
    op.drop_column("people", "phone")


def downgrade() -> None:
    op.add_column("people", sa.Column("phone", sa.String(30), nullable=True))
    op.execute("UPDATE people SET phone = '+' || phone_country_code || phone_number")
    op.alter_column("people", "phone", nullable=False)
    op.drop_column("people", "phone_number")
    op.drop_column("people", "phone_country_code")
