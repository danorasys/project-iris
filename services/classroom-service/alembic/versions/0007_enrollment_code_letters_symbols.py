"""classrooms.enrollment_code: 8 characters with letters, numbers and symbols

Only the guardian types the code now, from the parents' portal (ADR 0016),
so it no longer has to be digits a kid can pick with their gaze. HU-40 asks
for at least 8 characters mixing letters, numbers and symbols, which is also
much harder to guess. The column grows to 12 (room for a longer code later)
and every classroom gets a new code: the 7-digit ones stop working.

The generator is copied here on purpose, a migration must not change if the
app's code does later. Going back gives every classroom a 7-digit code again.

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-08
"""
from __future__ import annotations

import secrets
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ"
_DIGITS = "23456789"
_SYMBOLS = "#$%&*+?@"

_classrooms = sa.table("classrooms", sa.column("id", sa.Uuid()), sa.column("enrollment_code", sa.String()))


def _new_code() -> str:
    every = _LETTERS + _DIGITS + _SYMBOLS
    chars = [secrets.choice(_LETTERS), secrets.choice(_DIGITS), secrets.choice(_SYMBOLS)]
    chars += [secrets.choice(every) for _ in range(5)]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


def _old_code() -> str:
    return f"{secrets.randbelow(10_000_000):07d}"


# A fresh, unique code for every classroom, one UPDATE each (there are few).
def _recode(make_code) -> None:  # type: ignore[no-untyped-def]
    connection = op.get_bind()
    ids = [row.id for row in connection.execute(sa.select(_classrooms.c.id))]
    used: set[str] = set()
    for classroom_id in ids:
        code = make_code()
        while code in used:
            code = make_code()
        used.add(code)
        connection.execute(
            sa.update(_classrooms).where(_classrooms.c.id == classroom_id).values(enrollment_code=code)
        )


def upgrade() -> None:
    op.alter_column(
        "classrooms",
        "enrollment_code",
        existing_type=sa.String(length=7),
        type_=sa.String(length=12),
        existing_nullable=False,
    )
    _recode(_new_code)


def downgrade() -> None:
    _recode(_old_code)
    op.alter_column(
        "classrooms",
        "enrollment_code",
        existing_type=sa.String(length=12),
        type_=sa.String(length=7),
        existing_nullable=False,
    )
