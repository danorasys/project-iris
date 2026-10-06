"""classrooms.area and classrooms.grade: what a classroom is about and who it's for

What a classroom is about and who it's for (HU-100): its area, one of the
nine mandatory areas of basic education of Ley 115 (art. 23) plus "other",
which then needs the area written by the teacher (area_other, a CHECK keeps
it with "other" and only with it), and the one grade it's for, first to fifth, like the DBA, which go grade by
grade. The API requires both. The columns still allow NULL only because the
classrooms created before can't be guessed: their teachers fill them in
when they edit them, and a later migration makes them NOT NULL (expand,
then contract).

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-05
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

AREAS_SQL = (
    "'natural_sciences', 'social_sciences', 'arts', 'ethics', 'physical_education', "
    "'religion', 'humanities', 'mathematics', 'technology', 'other'"
)


def upgrade() -> None:
    op.add_column("classrooms", sa.Column("area", sa.String(length=30), nullable=True))
    op.add_column("classrooms", sa.Column("area_other", sa.String(length=60), nullable=True))
    op.add_column("classrooms", sa.Column("grade", sa.SmallInteger(), nullable=True))
    op.create_check_constraint("ck_classrooms_area", "classrooms", f"area IS NULL OR area IN ({AREAS_SQL})")
    op.create_check_constraint("ck_classrooms_grade", "classrooms", "grade IS NULL OR grade BETWEEN 1 AND 5")
    op.create_check_constraint(
        "ck_classrooms_area_other", "classrooms", "(area = 'other') = (area_other IS NOT NULL)"
    )


def downgrade() -> None:
    op.drop_constraint("ck_classrooms_area_other", "classrooms", type_="check")
    op.drop_constraint("ck_classrooms_grade", "classrooms", type_="check")
    op.drop_constraint("ck_classrooms_area", "classrooms", type_="check")
    op.drop_column("classrooms", "grade")
    op.drop_column("classrooms", "area_other")
    op.drop_column("classrooms", "area")
