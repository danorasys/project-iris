"""dba, dba_evidences and the DBA of each unit with its evidences

The catalog of the Derechos Básicos de Aprendizaje (DBA) of first to fifth
grade, by subject (mathematics, language, English, natural and social
sciences): each DBA with its number, a short name and its learning evidences.
The names and evidences are IRIS's own summaries, not the MEN's text, which
families and teachers read on Colombia Aprende. Ids are readable and stable
("natural_sciences-1-3", its evidences "natural_sciences-1-3-1"...), so a
later migration can update the catalog without breaking the lessons that use it.

A DBA is a goal for the whole year, worked over several lessons, so it goes
with the unit, like the MEN sequences: one of the catalog (units.dba_id) or
one the teacher writes (units.own_dba_name), never both, with its
Evidencias de Aprendizaje (unit_dba_points): an evidence of that DBA or one
the teacher writes, never both. Each lesson's own goal is its expected
performance. Needed to publish only in the areas with DBA, which the service
checks against the class.

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-10
"""
from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

CATALOG = Path(__file__).parent / "data" / "dba_catalog_2016.json"
SUBJECTS_SQL = "'mathematics', 'language', 'english', 'natural_sciences', 'social_sciences'"


def upgrade() -> None:
    dba = op.create_table(
        "dba",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column("subject", sa.String(20), nullable=False),
        sa.Column("grade", sa.SmallInteger(), nullable=False),
        sa.Column("number", sa.SmallInteger(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.CheckConstraint(f"subject IN ({SUBJECTS_SQL})", name="ck_dba_subject"),
        sa.CheckConstraint("grade BETWEEN 1 AND 5", name="ck_dba_grade"),
        sa.UniqueConstraint("subject", "grade", "number", name="uq_dba_subject_grade_number"),
    )
    evidences = op.create_table(
        "dba_evidences",
        sa.Column("id", sa.String(48), primary_key=True),
        sa.Column("dba_id", sa.String(40), sa.ForeignKey("dba.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("text", sa.String(300), nullable=False),
    )
    op.create_index("ix_dba_evidences_dba_order", "dba_evidences", ["dba_id", "order_index"])

    # RESTRICT: a DBA in use can't vanish from the catalog under a unit.
    op.add_column(
        "units", sa.Column("dba_id", sa.String(40), sa.ForeignKey("dba.id", ondelete="RESTRICT"), nullable=True)
    )
    op.add_column("units", sa.Column("own_dba_name", sa.String(200), nullable=True))
    op.create_check_constraint("ck_units_one_dba", "units", "dba_id IS NULL OR own_dba_name IS NULL")
    op.create_table(
        "unit_dba_points",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("unit_id", sa.Uuid(), sa.ForeignKey("units.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "evidence_id", sa.String(48), sa.ForeignKey("dba_evidences.id", ondelete="RESTRICT"), nullable=True
        ),
        sa.Column("text", sa.String(300), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False),
        # An evidence of the catalog or the teacher's own words, one of the two.
        sa.CheckConstraint("(evidence_id IS NULL) <> (text IS NULL)", name="ck_unit_dba_points_one_kind"),
    )
    op.create_index("ix_unit_dba_points_unit_order", "unit_dba_points", ["unit_id", "order_index"])

    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))["dba"]
    op.bulk_insert(
        dba,
        [{k: item[k] for k in ("id", "subject", "grade", "number", "name")} for item in catalog],
    )
    op.bulk_insert(
        evidences,
        [
            {"id": f"{item['id']}-{i}", "dba_id": item["id"], "order_index": i, "text": text}
            for item in catalog
            for i, text in enumerate(item["evidences"], start=1)
        ],
    )


def downgrade() -> None:
    op.drop_index("ix_unit_dba_points_unit_order", table_name="unit_dba_points")
    op.drop_table("unit_dba_points")
    op.drop_constraint("ck_units_one_dba", "units", type_="check")
    op.drop_column("units", "own_dba_name")
    op.drop_column("units", "dba_id")
    op.drop_index("ix_dba_evidences_dba_order", table_name="dba_evidences")
    op.drop_table("dba_evidences")
    op.drop_table("dba")
