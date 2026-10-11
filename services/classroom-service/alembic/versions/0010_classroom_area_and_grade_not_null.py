"""classrooms.area and classrooms.grade NOT NULL

The contract step of 0005 (expand, then contract). Since HU-100 the API
requires the area and the grade of every class, and the ones created before
got them when their teachers edited them, so now the database requires them
too: both columns are NOT NULL and their CHECKs no longer let NULL through.

A class without them can't be guessed (only its teacher knows what it's
about), so if one is still there the migration stops and says how many,
instead of making something up. Its teacher fills them in, then it runs again.

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-10
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

AREAS_SQL = (
    "'natural_sciences', 'social_sciences', 'arts', 'ethics', 'physical_education', "
    "'religion', 'humanities', 'mathematics', 'technology', 'other'"
)


def upgrade() -> None:
    missing = op.get_bind().execute(
        sa.text("SELECT count(*) FROM classrooms WHERE area IS NULL OR grade IS NULL")
    ).scalar_one()
    if missing:
        raise RuntimeError(
            f"{missing} clase(s) todavía no tienen área o grado. Su docente debe completarlos "
            "al editarlas antes de aplicar esta migración."
        )

    op.drop_constraint("ck_classrooms_area", "classrooms", type_="check")
    op.drop_constraint("ck_classrooms_grade", "classrooms", type_="check")
    op.alter_column("classrooms", "area", existing_type=sa.String(length=30), nullable=False)
    op.alter_column("classrooms", "grade", existing_type=sa.SmallInteger(), nullable=False)
    op.create_check_constraint("ck_classrooms_area", "classrooms", f"area IN ({AREAS_SQL})")
    op.create_check_constraint("ck_classrooms_grade", "classrooms", "grade BETWEEN 1 AND 5")


def downgrade() -> None:
    op.drop_constraint("ck_classrooms_grade", "classrooms", type_="check")
    op.drop_constraint("ck_classrooms_area", "classrooms", type_="check")
    op.alter_column("classrooms", "grade", existing_type=sa.SmallInteger(), nullable=True)
    op.alter_column("classrooms", "area", existing_type=sa.String(length=30), nullable=True)
    op.create_check_constraint("ck_classrooms_grade", "classrooms", "grade IS NULL OR grade BETWEEN 1 AND 5")
    op.create_check_constraint("ck_classrooms_area", "classrooms", f"area IS NULL OR area IN ({AREAS_SQL})")
