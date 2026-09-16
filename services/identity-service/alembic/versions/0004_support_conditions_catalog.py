"""add support_conditions catalog and split students.support_condition

The condition a family can indicate about their child is now selected from a
fixed catalog instead of typed as free text, and it's always required —
including a "Prefiero no especificar" entry for families with nothing to
disclose, so "required" never means forcing an actual diagnosis out of
anyone. A separate, still-optional free-text column
(additional_support_need) covers anything else the family wants to add,
independent of which catalog entry was chosen.

Also seeds document_types and relationship_types if they're empty: the
schema squash in migration 0001 kept both tables but dropped the INSERT
statements that used to seed them (the seed data survived in the database
this project has been developed against only because that database's volume
predates the squash). This backfills that gap so a freshly created database
ends up in the same state as the one already running, using
ON CONFLICT DO NOTHING so it's a no-op wherever the data is already there.

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-12
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import insert as pg_insert

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# Order matters: it's the order shown in the registration form's selector.
SUPPORT_CONDITIONS = [
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
SUPPORT_CONDITION_NAME_PREFER_NOT_TO_SPECIFY = "Prefiero no especificar"

DOCUMENT_TYPES = ["Cédula de ciudadanía", "Cédula de extranjería", "Pasaporte"]
RELATIONSHIP_TYPES = ["Madre", "Padre", "Acudiente legal", "Otro"]


def _seed_if_missing(table_name: str, names: list[str]) -> None:
    table = sa.table(table_name, sa.column("name", sa.String))
    stmt = pg_insert(table).values([{"name": name} for name in names]).on_conflict_do_nothing(index_elements=["name"])
    op.get_bind().execute(stmt)


def upgrade() -> None:
    _seed_if_missing("document_types", DOCUMENT_TYPES)
    _seed_if_missing("relationship_types", RELATIONSHIP_TYPES)

    op.create_table(
        "support_conditions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    support_conditions_table = sa.table("support_conditions", sa.column("name", sa.String))
    op.bulk_insert(support_conditions_table, [{"name": name} for name in SUPPORT_CONDITIONS])

    op.add_column("students", sa.Column("support_condition_id", sa.Integer(), nullable=True))
    op.add_column("students", sa.Column("support_condition_other", sa.String(length=200), nullable=True))
    op.add_column("students", sa.Column("additional_support_need", sa.String(length=500), nullable=True))

    # Existing free-text support_condition becomes the new
    # additional_support_need note (nothing forces it into one of the fixed
    # catalog values, since there's no reliable way to do that mapping
    # automatically); support_condition_id defaults to "Prefiero no
    # especificar" for every pre-existing row.
    op.execute(
        f"""
        UPDATE students
        SET
            additional_support_need = NULLIF(support_condition, ''),
            support_condition_id = (
                SELECT id FROM support_conditions WHERE name = '{SUPPORT_CONDITION_NAME_PREFER_NOT_TO_SPECIFY}'
            )
        """
    )

    op.alter_column("students", "support_condition_id", nullable=False)
    op.create_foreign_key(
        "fk_students_support_condition_id", "students", "support_conditions", ["support_condition_id"], ["id"]
    )
    op.drop_column("students", "support_condition")


def downgrade() -> None:
    op.add_column("students", sa.Column("support_condition", sa.String(length=500), nullable=True))
    op.execute("UPDATE students SET support_condition = additional_support_need")

    op.drop_constraint("fk_students_support_condition_id", "students", type_="foreignkey")
    op.drop_column("students", "additional_support_need")
    op.drop_column("students", "support_condition_other")
    op.drop_column("students", "support_condition_id")

    op.drop_table("support_conditions")
    # The document_types/relationship_types seed backfill is intentionally
    # left in place: removing rows another migration or the app may already
    # depend on would be more destructive than leaving harmless catalog rows.
