# Application-layer inputs, independent of Pydantic so application/ doesn't
# depend on FastAPI. The api/ layer maps its schemas to these dataclasses.

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID


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
