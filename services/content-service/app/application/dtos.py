# Application-layer inputs, independent of Pydantic so application/ doesn't
# depend on FastAPI. The api/ layer maps its schemas to these dataclasses.

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

from app.domain.entities import Attempt, Extra, Lesson


# One block of a page, as the editor sends it. Each type uses its own
# fields: text, items (list), rows (table, the first is the header) or
# image_file and alt_text (image).
@dataclass
class BlockInput:
    type: str
    page_index: int
    order_index: int
    text: str | None = None
    items: list[str] | None = None
    rows: list[list[str]] | None = None
    image_file: str | None = None
    alt_text: str | None = None


@dataclass
class OptionInput:
    text: str
    is_correct: bool


@dataclass
class QuestionInput:
    prompt: str
    options: list[OptionInput] = field(default_factory=list)


@dataclass
class ActivityInput:
    pass_threshold: int
    questions: list[QuestionInput] = field(default_factory=list)


# What can change of a lesson itself. None leaves it as it is.
@dataclass
class LessonChanges:
    unit_id: UUID | None = None
    title: str | None = None
    purpose: str | None = None
    learning_goal: str | None = None


# What can change of an extra. None leaves it as it is.
@dataclass
class ExtraChanges:
    title: str | None = None
    for_everyone: bool | None = None
    student_ids: list[UUID] | None = None


# --- progress (HU-46, HU-47) ---------------------------------------------------
# Outputs of ProgressService. Lesson, Extra and Attempt come from the domain.


# A lesson the way a kid plays it: its pages, its activity and the extras
# for them, with how far they already got in each part (extra id or None).
@dataclass
class PlayableLesson:
    lesson: Lesson
    extras: list[Extra]
    # Per part (None is the lesson itself): the furthest page, the page
    # where they left, and the parts whose activity they already did.
    pages_seen: dict[UUID | None, int] = field(default_factory=dict)
    last_page: dict[UUID | None, int] = field(default_factory=dict)
    activity_done: set[UUID | None] = field(default_factory=set)


# A graded try: the record kept, and right or wrong per question in order.
@dataclass
class AttemptResult:
    attempt: Attempt
    results: list[bool]


# One part of a lesson (the lesson itself or an extra) in a kid's progress.
@dataclass
class PartProgress:
    extra_id: UUID | None
    title: str
    kind: str  # "leccion", "contenido" or "actividad"
    total_pages: int
    pages_seen: int
    has_activity: bool
    attempts: list[Attempt]
    percent: int


@dataclass
class LessonProgress:
    lesson_id: UUID
    title: str
    unit_title: str
    main: PartProgress
    extras: list[PartProgress]
