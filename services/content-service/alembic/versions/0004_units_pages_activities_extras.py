"""units, lesson purpose and goal, pages, activities and extras

The full structure of a classroom's content (ADR 0013): every lesson lives
in a unit and has a purpose and a learning goal; its blocks are spread in
pages and can be titles, subtitles, paragraphs, lists, tables or images
with their alternative text; it has an activity of multiple choice
questions and optional extras, for everyone or for some kids.

Lessons written before get a "Unidad 1" per classroom and neutral texts in
purpose and goal, so every column can be NOT NULL from the start; the
teacher replaces them when editing.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-05
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

BLOCK_TYPES_SQL = "'titulo', 'subtitulo', 'texto', 'lista', 'tabla', 'imagen'"


def upgrade() -> None:
    op.create_table(
        "units",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("classroom_id", sa.Uuid(), nullable=False),
        sa.Column("teacher_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("guiding_question", sa.String(length=300), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_units_classroom_order", "units", ["classroom_id", "order_index"])

    # Lessons: unit, purpose and goal. Filled for the old ones, then NOT NULL.
    op.add_column("lessons", sa.Column("unit_id", sa.Uuid(), nullable=True))
    op.add_column("lessons", sa.Column("purpose", sa.String(length=200), nullable=True))
    op.add_column("lessons", sa.Column("learning_goal", sa.String(length=300), nullable=True))
    op.execute(
        """
        INSERT INTO units (id, classroom_id, teacher_id, title, guiding_question, order_index)
        SELECT gen_random_uuid(), classroom_id, (array_agg(teacher_id))[1], 'Unidad 1',
               '¿Qué vamos a aprender en esta unidad?', 0
        FROM lessons GROUP BY classroom_id
        """
    )
    op.execute("UPDATE lessons SET unit_id = units.id FROM units WHERE units.classroom_id = lessons.classroom_id")
    op.execute("UPDATE lessons SET purpose = title, learning_goal = 'Por definir'")
    op.alter_column("lessons", "unit_id", nullable=False)
    op.alter_column("lessons", "purpose", nullable=False)
    op.alter_column("lessons", "learning_goal", nullable=False)
    op.create_foreign_key("fk_lessons_unit", "lessons", "units", ["unit_id"], ["id"], ondelete="RESTRICT")
    op.create_index("ix_lessons_unit_order", "lessons", ["unit_id", "order_index"])

    op.create_table(
        "extras",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("lesson_id", sa.Uuid(), sa.ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("for_everyone", sa.Boolean(), nullable=False),
        sa.CheckConstraint("kind IN ('contenido', 'actividad')", name="ck_extras_kind"),
    )
    op.create_index("ix_extras_lesson_order", "extras", ["lesson_id", "order_index"])
    op.create_table(
        "extra_students",
        sa.Column("extra_id", sa.Uuid(), sa.ForeignKey("extras.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("student_id", sa.Uuid(), primary_key=True),
    )

    # Blocks: page, alternative text, the extra they belong to and a known type.
    op.add_column("content_blocks", sa.Column("page_index", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("content_blocks", sa.Column("alt_text", sa.String(length=200), nullable=True))
    op.add_column(
        "content_blocks",
        sa.Column("extra_id", sa.Uuid(), sa.ForeignKey("extras.id", ondelete="CASCADE"), nullable=True),
    )
    op.alter_column("content_blocks", "page_index", server_default=None)
    op.create_check_constraint("ck_content_blocks_type", "content_blocks", f"type IN ({BLOCK_TYPES_SQL})")
    op.create_check_constraint("ck_content_blocks_page_index", "content_blocks", "page_index >= 0")
    op.drop_index("ix_content_blocks_lesson_order", table_name="content_blocks")
    op.create_index(
        "ix_content_blocks_lesson_order", "content_blocks", ["lesson_id", "page_index", "order_index"]
    )
    op.create_index("ix_content_blocks_extra", "content_blocks", ["extra_id"])

    op.create_table(
        "activities",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("lesson_id", sa.Uuid(), sa.ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("extra_id", sa.Uuid(), sa.ForeignKey("extras.id", ondelete="CASCADE"), nullable=True),
        sa.Column("pass_threshold", sa.Integer(), nullable=False),
        sa.CheckConstraint("pass_threshold >= 1", name="ck_activities_pass_threshold"),
    )
    op.create_index(
        "uq_activities_lesson_main", "activities", ["lesson_id"], unique=True, postgresql_where=sa.text("extra_id IS NULL")
    )
    op.create_index("uq_activities_extra", "activities", ["extra_id"], unique=True)
    op.create_table(
        "questions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("activity_id", sa.Uuid(), sa.ForeignKey("activities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("prompt", sa.String(length=300), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
    )
    op.create_index("ix_questions_activity_order", "questions", ["activity_id", "order_index"])
    op.create_table(
        "question_options",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("question_id", sa.Uuid(), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("text", sa.String(length=150), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
    )
    op.create_index("ix_question_options_question_order", "question_options", ["question_id", "order_index"])
    op.create_index(
        "uq_question_options_one_correct",
        "question_options",
        ["question_id"],
        unique=True,
        postgresql_where=sa.text("is_correct"),
    )


def downgrade() -> None:
    op.drop_table("question_options")
    op.drop_table("questions")
    op.drop_table("activities")

    op.drop_index("ix_content_blocks_extra", table_name="content_blocks")
    op.drop_index("ix_content_blocks_lesson_order", table_name="content_blocks")
    op.create_index("ix_content_blocks_lesson_order", "content_blocks", ["lesson_id", "order_index"])
    op.drop_constraint("ck_content_blocks_page_index", "content_blocks", type_="check")
    op.drop_constraint("ck_content_blocks_type", "content_blocks", type_="check")
    # Blocks of extras and the new kinds of block didn't exist before.
    op.execute("DELETE FROM content_blocks WHERE extra_id IS NOT NULL OR type NOT IN ('texto', 'imagen')")
    op.drop_column("content_blocks", "extra_id")
    op.drop_column("content_blocks", "alt_text")
    op.drop_column("content_blocks", "page_index")

    op.drop_table("extra_students")
    op.drop_table("extras")

    op.drop_index("ix_lessons_unit_order", table_name="lessons")
    op.drop_constraint("fk_lessons_unit", "lessons", type_="foreignkey")
    op.drop_column("lessons", "learning_goal")
    op.drop_column("lessons", "purpose")
    op.drop_column("lessons", "unit_id")
    op.drop_table("units")
