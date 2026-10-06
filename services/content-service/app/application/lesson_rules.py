# What makes a lesson complete, and how lists and tables are kept. Pure
# functions, called before publishing or saving a published lesson (ADR 0013).

from __future__ import annotations

import json

from app.domain.entities import (
    BLOCK_IMAGE,
    BLOCK_LIST,
    BLOCK_TABLE,
    EXTRA_ACTIVITY,
    EXTRA_CONTENT,
    Activity,
    ContentBlock,
    Extra,
    Lesson,
)

# Limits of what a teacher can write. The API repeats them in its schemas,
# these are the ones the service trusts.
UNIT_TITLE_MAX = 120
GUIDING_QUESTION_MAX = 300
LESSON_TITLE_MAX = 200
PURPOSE_MAX = 200
LEARNING_GOAL_MAX = 300
HEADING_MAX = 200
PARAGRAPH_MAX = 5000
LIST_ITEMS_MAX = 20
LIST_ITEM_MAX = 300
TABLE_ROWS_MAX = 10
TABLE_COLUMNS_MAX = 6
TABLE_CELL_MAX = 200
ALT_TEXT_MAX = 200
PAGES_MAX = 30
BLOCKS_PER_PAGE_MAX = 15
QUESTIONS_MAX = 20
QUESTION_MAX = 300
OPTIONS_MIN = 2
OPTIONS_MAX = 4
OPTION_MAX = 150
EXTRA_TITLE_MAX = 120
EXTRAS_MAX = 10


# Lists and tables are stored as JSON text in the block's content column.
def encode_items(items: list[str]) -> str:
    return json.dumps(items, ensure_ascii=False)


def encode_rows(rows: list[list[str]]) -> str:
    return json.dumps(rows, ensure_ascii=False)


def decode_items(content: str | None) -> list[str]:
    value = json.loads(content) if content else []
    return [str(item) for item in value] if isinstance(value, list) else []


def decode_rows(content: str | None) -> list[list[str]]:
    value = json.loads(content) if content else []
    if not isinstance(value, list):
        return []
    return [[str(cell) for cell in row] for row in value if isinstance(row, list)]


def _block_is_complete(block: ContentBlock) -> bool:
    if block.type == BLOCK_IMAGE:
        return bool(block.image_file) and bool((block.alt_text or "").strip())
    if block.type == BLOCK_LIST:
        items = decode_items(block.content)
        return bool(items) and all(item.strip() for item in items)
    if block.type == BLOCK_TABLE:
        rows = decode_rows(block.content)
        # A header row and at least one row of data, every cell filled.
        return len(rows) >= 2 and all(cell.strip() for row in rows for cell in row)
    return bool((block.content or "").strip())


def _pages_missing(blocks: list[ContentBlock], where: str) -> list[str]:
    if not blocks:
        return [f"{where}: agrega al menos un bloque de contenido."]
    missing: list[str] = []
    pages = sorted({block.page_index for block in blocks})
    for number, page in enumerate(pages, start=1):
        page_blocks = [block for block in blocks if block.page_index == page]
        if any(block.type == BLOCK_IMAGE and not (block.alt_text or "").strip() for block in page_blocks):
            missing.append(f"{where}, página {number}: describe cada imagen con su texto alternativo.")
        if any(block.type != BLOCK_IMAGE and not _block_is_complete(block) for block in page_blocks):
            missing.append(f"{where}, página {number}: completa o quita los bloques vacíos.")
    return missing


def _activity_missing(activity: Activity | None, where: str) -> list[str]:
    if activity is None or not activity.questions:
        return [f"{where}: agrega al menos una pregunta."]
    missing: list[str] = []
    for number, question in enumerate(activity.questions, start=1):
        if not question.prompt.strip():
            missing.append(f"{where}, pregunta {number}: escribe el enunciado.")
        if not OPTIONS_MIN <= len(question.options) <= OPTIONS_MAX:
            missing.append(f"{where}, pregunta {number}: debe tener entre {OPTIONS_MIN} y {OPTIONS_MAX} opciones.")
        elif any(not option.text.strip() for option in question.options):
            missing.append(f"{where}, pregunta {number}: completa el texto de todas las opciones.")
        if sum(option.is_correct for option in question.options) != 1:
            missing.append(f"{where}, pregunta {number}: marca exactamente una opción correcta.")
    if not 1 <= activity.pass_threshold <= len(activity.questions):
        missing.append(f"{where}: el mínimo para aprobar debe estar entre 1 y {len(activity.questions)}.")
    return missing


# What an extra still needs. An incomplete extra doesn't stop the lesson
# from being published, the kids just don't see it until it's complete.
def extra_missing(extra: Extra) -> list[str]:
    where = f"Extra “{extra.title}”"
    missing: list[str] = []
    if not extra.for_everyone and not extra.student_ids:
        missing.append(f"{where}: elige para qué estudiantes es.")
    if extra.kind == EXTRA_CONTENT:
        missing += _pages_missing(extra.blocks, where)
    elif extra.kind == EXTRA_ACTIVITY:
        missing += _activity_missing(extra.activity, where)
    return missing


# Everything a lesson still needs to be published, in the teacher's words.
# Empty when it's complete. Extras are optional, see extra_missing.
def missing_to_publish(lesson: Lesson) -> list[str]:
    missing: list[str] = []
    if not lesson.purpose.strip():
        missing.append("Escribe el propósito de la lección.")
    if not lesson.learning_goal.strip():
        missing.append("Escribe el desempeño esperado de la lección.")
    missing += _pages_missing(lesson.blocks, "Contenido")
    missing += _activity_missing(lesson.activity, "Actividad")
    return missing
