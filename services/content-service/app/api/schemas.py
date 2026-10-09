from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.application import lesson_rules as rules

# Same shape as the names upload_image creates. A block can't carry a URL,
# so a lesson can't load images from outside IRIS.
IMAGE_FILE_PATTERN = r"^[0-9a-f]{32}\.[a-z0-9]{1,5}$"

# The literal VALUES are kept in Spanish on purpose: they're data stored in
# the database, see app/domain/entities.py.
BlockType = Literal["titulo", "subtitulo", "texto", "lista", "tabla", "imagen"]
LessonStatus = Literal["borrador", "publicada"]
ExtraKind = Literal["contenido", "actividad"]

# Saving keeps half done work of a draft (an empty paragraph, an image still
# without its description); publishing asks for everything (lesson_rules).
ListItem = Annotated[str, Field(max_length=rules.LIST_ITEM_MAX)]
TableCell = Annotated[str, Field(max_length=rules.TABLE_CELL_MAX)]


def _not_null(model: BaseModel, *fields: str) -> None:
    # In a PATCH, leaving a field out keeps it; sending null isn't allowed
    # for the ones that are always required.
    for name in fields:
        if name in model.model_fields_set and getattr(model, name) is None:
            raise ValueError(f"El campo '{name}' es obligatorio.")


class _Strict(BaseModel):
    # Spaces around are dropped, unknown fields are refused.
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


# --- blocks --------------------------------------------------------------------


class BlockInput(_Strict):
    type: BlockType
    page_index: int = Field(ge=0, lt=rules.PAGES_MAX)
    order_index: int = Field(ge=0, lt=rules.BLOCKS_PER_PAGE_MAX)
    text: str | None = Field(default=None, max_length=rules.PARAGRAPH_MAX)
    items: list[ListItem] | None = Field(default=None, max_length=rules.LIST_ITEMS_MAX)
    rows: list[list[TableCell]] | None = Field(default=None, max_length=rules.TABLE_ROWS_MAX)
    image_file: str | None = Field(default=None, pattern=IMAGE_FILE_PATTERN)
    alt_text: str | None = Field(default=None, max_length=rules.ALT_TEXT_MAX)

    @model_validator(mode="after")
    def _fields_match_the_type(self) -> BlockInput:
        if self.type in ("titulo", "subtitulo"):
            if self.text is None:
                raise ValueError("Un título o subtítulo lleva 'text'.")
            if len(self.text) > rules.HEADING_MAX or "\n" in self.text:
                raise ValueError(f"Un título o subtítulo es una sola línea de máximo {rules.HEADING_MAX} caracteres.")
        elif self.type == "texto":
            if self.text is None:
                raise ValueError("Un párrafo lleva 'text'.")
        elif self.type == "lista":
            if self.items is None:
                raise ValueError("Una lista lleva 'items'.")
        elif self.type == "tabla":
            if not self.rows:
                raise ValueError("Una tabla lleva 'rows', la primera es el encabezado.")
            widths = {len(row) for row in self.rows}
            if len(widths) != 1 or not 1 <= widths.pop() <= rules.TABLE_COLUMNS_MAX:
                raise ValueError(f"Todas las filas tienen las mismas columnas, entre 1 y {rules.TABLE_COLUMNS_MAX}.")
        elif self.type == "imagen" and not self.image_file:
            raise ValueError("Una imagen lleva 'image_file'.")
        return self


def _check_pages(blocks: list[BlockInput] | None) -> None:
    if blocks is None:
        return
    seen: set[tuple[int, int]] = set()
    for block in blocks:
        key = (block.page_index, block.order_index)
        if key in seen:
            raise ValueError("Dos bloques no pueden ocupar el mismo lugar de una página.")
        seen.add(key)


# --- units --------------------------------------------------------------------------


class CreateUnitRequest(_Strict):
    title: str = Field(min_length=1, max_length=rules.UNIT_TITLE_MAX)
    guiding_question: str = Field(min_length=1, max_length=rules.GUIDING_QUESTION_MAX)


class UpdateUnitRequest(_Strict):
    title: str | None = Field(default=None, min_length=1, max_length=rules.UNIT_TITLE_MAX)
    guiding_question: str | None = Field(default=None, min_length=1, max_length=rules.GUIDING_QUESTION_MAX)

    @model_validator(mode="after")
    def _required_stay_required(self) -> UpdateUnitRequest:
        _not_null(self, "title", "guiding_question")
        return self


class OrderRequest(_Strict):
    ids: list[UUID] = Field(max_length=200)


# --- lessons ------------------------------------------------------------------------


class CreateLessonRequest(_Strict):
    title: str = Field(min_length=1, max_length=rules.LESSON_TITLE_MAX)
    purpose: str = Field(min_length=1, max_length=rules.PURPOSE_MAX)
    learning_goal: str = Field(min_length=1, max_length=rules.LEARNING_GOAL_MAX)


class UpdateLessonRequest(_Strict):
    unit_id: UUID | None = None
    title: str | None = Field(default=None, min_length=1, max_length=rules.LESSON_TITLE_MAX)
    purpose: str | None = Field(default=None, min_length=1, max_length=rules.PURPOSE_MAX)
    learning_goal: str | None = Field(default=None, min_length=1, max_length=rules.LEARNING_GOAL_MAX)
    # The whole set of the lesson's pages, it replaces the one saved.
    blocks: list[BlockInput] | None = Field(default=None, max_length=rules.PAGES_MAX * rules.BLOCKS_PER_PAGE_MAX)

    @model_validator(mode="after")
    def _check(self) -> UpdateLessonRequest:
        _not_null(self, "unit_id", "title", "purpose", "learning_goal", "blocks")
        _check_pages(self.blocks)
        return self


# --- activity -----------------------------------------------------------------------


class OptionInput(_Strict):
    text: str = Field(max_length=rules.OPTION_MAX)
    is_correct: bool = False


class QuestionInput(_Strict):
    prompt: str = Field(max_length=rules.QUESTION_MAX)
    options: list[OptionInput] = Field(min_length=rules.OPTIONS_MIN, max_length=rules.OPTIONS_MAX)

    @model_validator(mode="after")
    def _at_most_one_right(self) -> QuestionInput:
        if sum(option.is_correct for option in self.options) > 1:
            raise ValueError("Una pregunta tiene una sola opción correcta.")
        return self


class ActivityRequest(_Strict):
    pass_threshold: int = Field(ge=1, le=rules.QUESTIONS_MAX)
    questions: list[QuestionInput] = Field(max_length=rules.QUESTIONS_MAX)


# --- extras -------------------------------------------------------------------------


class CreateExtraRequest(_Strict):
    kind: ExtraKind
    title: str = Field(min_length=1, max_length=rules.EXTRA_TITLE_MAX)
    for_everyone: bool = True
    student_ids: list[UUID] = Field(default_factory=list, max_length=100)


class UpdateExtraRequest(_Strict):
    title: str | None = Field(default=None, min_length=1, max_length=rules.EXTRA_TITLE_MAX)
    for_everyone: bool | None = None
    student_ids: list[UUID] | None = Field(default=None, max_length=100)
    blocks: list[BlockInput] | None = Field(default=None, max_length=rules.PAGES_MAX * rules.BLOCKS_PER_PAGE_MAX)

    @model_validator(mode="after")
    def _check(self) -> UpdateExtraRequest:
        _not_null(self, "title", "for_everyone", "student_ids", "blocks")
        _check_pages(self.blocks)
        return self


# --- responses ----------------------------------------------------------------------


class BlockResponse(BaseModel):
    id: UUID
    type: str
    page_index: int
    order_index: int
    text: str | None = None
    items: list[str] | None = None
    rows: list[list[str]] | None = None
    # Build GET /lessons/{lesson_id}/images/{image_file} to show it. It needs
    # the user's session, the bucket behind it is private.
    image_file: str | None = None
    alt_text: str | None = None


class OptionResponse(BaseModel):
    text: str
    is_correct: bool


class QuestionResponse(BaseModel):
    prompt: str
    options: list[OptionResponse]


class ActivityResponse(BaseModel):
    pass_threshold: int
    questions: list[QuestionResponse]


class ExtraResponse(BaseModel):
    id: UUID
    kind: str
    title: str
    order_index: int
    for_everyone: bool
    student_ids: list[UUID]
    blocks: list[BlockResponse]
    activity: ActivityResponse | None
    # What it still needs; the kids only see it once this is empty.
    missing: list[str]


# What the teacher has built in one classroom (units and lessons).
class ClassroomContentSummaryResponse(BaseModel):
    classroom_id: UUID
    units: int
    published_lessons: int
    draft_lessons: int


class PublishedLessonsResponse(BaseModel):
    classroom_id: UUID
    published_lessons: int
    # Units with at least one published lesson.
    published_units: int


class UnitResponse(BaseModel):
    id: UUID
    classroom_id: UUID
    title: str
    guiding_question: str
    order_index: int


class LessonResponse(BaseModel):
    id: UUID
    classroom_id: UUID
    unit_id: UUID
    teacher_id: UUID
    title: str
    purpose: str
    learning_goal: str
    order_index: int
    status: str


class UnitWithLessonsResponse(UnitResponse):
    lessons: list[LessonResponse]


class LessonDetailResponse(LessonResponse):
    blocks: list[BlockResponse]
    # Only for its teacher: the right answers never go to a kid.
    activity: ActivityResponse | None = None
    extras: list[ExtraResponse] = []
    # Only for its teacher: what's still missing to publish it.
    missing: list[str] = []


class ImageUploadResponse(BaseModel):
    image_file: str


# --- a kid playing a lesson (HU-46, HU-47) ---------------------------------------
# Questions and options carry their ids so the kid can answer, and never
# whether an option is the right one: the server grades.


class PlayOptionResponse(BaseModel):
    id: UUID
    text: str


class PlayQuestionResponse(BaseModel):
    id: UUID
    prompt: str
    options: list[PlayOptionResponse]


class PlayActivityResponse(BaseModel):
    pass_threshold: int
    questions: list[PlayQuestionResponse]


class PlayExtraResponse(BaseModel):
    id: UUID
    kind: str
    title: str
    blocks: list[BlockResponse]
    activity: PlayActivityResponse | None
    # The furthest page the kid already reached in it, the page where they
    # left, and whether they already did its activity once.
    pages_seen: int
    last_page: int
    activity_done: bool


class PlayLessonResponse(LessonResponse):
    blocks: list[BlockResponse]
    activity: PlayActivityResponse | None
    extras: list[PlayExtraResponse]
    pages_seen: int
    last_page: int
    activity_done: bool


class ReachPageRequest(_Strict):
    # The page reached, counting from 1, of the lesson or of an extra.
    page: int = Field(ge=1, le=rules.PAGES_MAX)
    extra_id: UUID | None = None


class PageProgressResponse(BaseModel):
    extra_id: UUID | None
    pages_seen: int
    last_page: int


class AnswerInput(_Strict):
    question_id: UUID
    option_id: UUID


class AnswerCheckRequest(_Strict):
    extra_id: UUID | None = None
    question_id: UUID
    option_id: UUID


class AnswerCheckResponse(BaseModel):
    correct: bool


class AttemptRequest(_Strict):
    extra_id: UUID | None = None
    answers: list[AnswerInput] = Field(min_length=1, max_length=rules.QUESTIONS_MAX)

    @model_validator(mode="after")
    def _one_answer_per_question(self) -> AttemptRequest:
        if len({a.question_id for a in self.answers}) != len(self.answers):
            raise ValueError("Cada pregunta se responde una sola vez.")
        return self


class AttemptResponse(BaseModel):
    id: UUID
    correct: int
    total: int
    passed: bool
    created_at: datetime
    # Right or wrong, per question in their order.
    results: list[bool]


# --- erasing a guardian's kids, for identity-service (HU-91) -----------------------


class EraseStudentsRequest(BaseModel):
    student_ids: list[UUID] = Field(max_length=100)


class EraseStudentsResponse(BaseModel):
    rows_deleted: int


# --- the statistics of a class, for classroom-service (HU-86, HU-87) -------------


class KidInLessonOut(BaseModel):
    student_id: UUID
    percent: int
    tries: int
    best_correct: int | None
    best_total: int | None
    passed: bool


class LessonStatisticsOut(BaseModel):
    lesson_id: UUID
    title: str
    unit_title: str
    has_activity: bool
    average_percent: int
    completed: int
    in_progress: int
    not_started: int
    passed: int
    tried_not_passed: int
    # Best performance first; the ones who haven't tried go last.
    kids: list[KidInLessonOut]


class KidInClassOut(BaseModel):
    student_id: UUID
    average_percent: int
    completed_lessons: int


class ClassStatisticsOut(BaseModel):
    kids: int
    lessons: list[LessonStatisticsOut]
    completed_percent: int
    average_percent: int
    by_kid: list[KidInClassOut]


# --- a kid's progress in a class, for classroom-service ---------------------------


class AttemptOut(BaseModel):
    correct: int
    total: int
    passed: bool
    created_at: datetime


class PartProgressResponse(BaseModel):
    extra_id: UUID | None
    title: str
    # "leccion", or the kind of the extra: "contenido" or "actividad".
    kind: str
    total_pages: int
    pages_seen: int
    has_activity: bool
    attempts: list[AttemptOut]
    percent: int


class LessonProgressResponse(BaseModel):
    lesson_id: UUID
    title: str
    unit_title: str
    main: PartProgressResponse
    extras: list[PartProgressResponse]
