"""drop the support conditions: IRIS keeps no health data of the kids

The support conditions of a kid (a catalog of motor conditions, the free
text of "Otra condición" and the additional support need) were health data
of a minor, a sensitive datum (Ley 1581 de 2012, art. 5). No part of IRIS
used them, and the registration asked for them together with a mandatory
authorization to share them, which a sensitive datum can't have (Decreto
1377 de 2013, art. 6). So they go away, with what was already saved.

Removed: the tables student_support_conditions and support_conditions, the
columns students.support_condition_other and students.additional_support_need,
and consents.authorizes_support_condition.

Going back down brings the structure back (with the catalog, the same 15
entries of 0004), but not the data: it was deleted on purpose. The old
consents come back with authorizes_support_condition false.

Revision ID: 0020
Revises: 0019
Create Date: 2026-10-12
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# Written out here, the app no longer has the catalog. Same order as 0004.
_CATALOG = [
    "Parálisis cerebral",
    "Lesión medular",
    "Mielomeningocele",
    "Enfermedad de Arnold Chiari",
    "Distrofias musculares / miopatías",
    "Agenesia del cuerpo calloso u otra malformación congénita",
    "Luxación congénita de cadera",
    "Artrogriposis",
    "Parálisis de Guillain-Barré",
    "Poliomielitis anterior aguda",
    "Traumatismo craneoencefálico",
    "Reumatismos infantiles",
    "Mutilaciones o amputaciones",
    "Otra condición (especificar)",
    "Prefiero no especificar",
]


def upgrade() -> None:
    # The links first, they point to the catalog.
    op.drop_table("student_support_conditions")
    op.drop_table("support_conditions")
    op.drop_column("students", "additional_support_need")
    op.drop_column("students", "support_condition_other")
    op.drop_column("consents", "authorizes_support_condition")


def downgrade() -> None:
    # The old consents get false: nobody authorizes anything on the way back.
    op.add_column(
        "consents",
        sa.Column("authorizes_support_condition", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("consents", "authorizes_support_condition", server_default=None)

    op.add_column("students", sa.Column("support_condition_other", sa.String(length=200), nullable=True))
    op.add_column("students", sa.Column("additional_support_need", sa.String(length=500), nullable=True))

    op.create_table(
        "support_conditions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    catalog = sa.table("support_conditions", sa.column("name", sa.String))
    op.bulk_insert(catalog, [{"name": name} for name in _CATALOG])

    op.create_table(
        "student_support_conditions",
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("support_condition_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["support_condition_id"], ["support_conditions.id"]),
        sa.PrimaryKeyConstraint("student_id", "support_condition_id"),
    )
