"""add avatars catalog and switch students.avatar to avatar_id

The 4 student avatars were a fixed set enforced only by a Pydantic Literal
and a CHECK constraint on students.avatar (a free string like "avatar1").
They're now a real catalog table, same pattern as document_types,
relationship_types and support_conditions: an id/name/image_path row per
avatar, so adding a new one later is a data change, not a code change.

image_path is a public URL into the same MinIO/S3 bucket every other
uploaded asset already lives in (see content-service's storage.py) — under
its own "avatars/" prefix, uploaded once, out of band, not through this
service. S3_PUBLIC_URL/S3_BUCKET are read from the environment this
migration runs in (see docker-compose.yml's identity-service block) so the
seeded URLs are correct wherever this actually gets applied, not hardcoded
to one environment.

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-13
"""
from __future__ import annotations

import os
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

_S3_PUBLIC_URL = os.environ.get("S3_PUBLIC_URL", "http://localhost:9000").rstrip("/")
_S3_BUCKET = os.environ.get("S3_BUCKET", "iris-media")


def _avatar_image_url(file_name: str) -> str:
    return f"{_S3_PUBLIC_URL}/{_S3_BUCKET}/avatars/{file_name}"


# Order matters: it's the order shown in the avatar picker, and it's also
# used below to backfill the old "avatarN" strings positionally (avatar1 is
# the 1st row inserted, and so on) since nothing else ties the old values to
# these new rows.
AVATARS = [
    {"name": "Violeta", "image_path": _avatar_image_url("avatar-1.png")},
    {"name": "Coral", "image_path": _avatar_image_url("avatar-2.png")},
    {"name": "Bosque", "image_path": _avatar_image_url("avatar-3.png")},
    {"name": "Cielo", "image_path": _avatar_image_url("avatar-4.png")},
]


def upgrade() -> None:
    op.create_table(
        "avatars",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("image_path", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    avatars_table = sa.table("avatars", sa.column("name", sa.String), sa.column("image_path", sa.Text))
    op.bulk_insert(avatars_table, AVATARS)

    op.add_column("students", sa.Column("avatar_id", sa.Integer(), nullable=True))

    # Positional backfill: "avatar1".."avatar4" become the 1st..4th row
    # inserted above (Postgres assigns ids 1..4 to a fresh sequence here).
    for position, _ in enumerate(AVATARS, start=1):
        op.execute(
            f"""
            UPDATE students
            SET avatar_id = (SELECT id FROM avatars ORDER BY id LIMIT 1 OFFSET {position - 1})
            WHERE avatar = 'avatar{position}'
            """
        )
    # Anything that didn't match one of the 4 known strings (shouldn't
    # happen, the CHECK constraint being dropped below only ever allowed
    # those 4) falls back to the first avatar rather than being left NULL.
    op.execute(
        "UPDATE students SET avatar_id = (SELECT id FROM avatars ORDER BY id LIMIT 1) WHERE avatar_id IS NULL"
    )

    op.alter_column("students", "avatar_id", nullable=False)
    op.create_foreign_key("fk_students_avatar_id", "students", "avatars", ["avatar_id"], ["id"])
    op.drop_constraint("ck_students_avatar_valido", "students", type_="check")
    op.drop_column("students", "avatar")


def downgrade() -> None:
    op.add_column("students", sa.Column("avatar", sa.String(length=60), nullable=True))
    op.execute(
        """
        UPDATE students
        SET avatar = 'avatar' || (SELECT row_number FROM (
            SELECT id, row_number() OVER (ORDER BY id) AS row_number FROM avatars
        ) ranked WHERE ranked.id = students.avatar_id)
        """
    )
    op.alter_column("students", "avatar", nullable=False)
    op.create_check_constraint(
        "ck_students_avatar_valido", "students", "avatar IN ('avatar1', 'avatar2', 'avatar3', 'avatar4')"
    )

    op.drop_constraint("fk_students_avatar_id", "students", type_="foreignkey")
    op.drop_column("students", "avatar_id")

    op.drop_table("avatars")
