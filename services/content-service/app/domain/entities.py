# Domain entities.
#
# Plain dataclasses, no FastAPI or SQLAlchemy dependency.
#
# The content of a classroom goes Unit → Lesson → its pages of blocks, its
# activity and its extras (ADR 0013). The enum-like string VALUES stored in
# `status` and `type` ("borrador", "publicada", "texto", "imagen"...) are
# kept in Spanish on purpose: some were already in the database before the
# English refactor, and new ones follow them so the column reads the same.

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

STATUS_DRAFT = "borrador"
STATUS_PUBLISHED = "publicada"

# The kinds of block of a page (HU-79). "texto" is a paragraph.
BLOCK_TITLE = "titulo"
BLOCK_SUBTITLE = "subtitulo"
BLOCK_PARAGRAPH = "texto"
BLOCK_LIST = "lista"
BLOCK_TABLE = "tabla"
BLOCK_IMAGE = "imagen"
BLOCK_TYPES = (BLOCK_TITLE, BLOCK_SUBTITLE, BLOCK_PARAGRAPH, BLOCK_LIST, BLOCK_TABLE, BLOCK_IMAGE)

# An extra is more content to read or one more activity (HU-82).
EXTRA_CONTENT = "contenido"
EXTRA_ACTIVITY = "actividad"
EXTRA_KINDS = (EXTRA_CONTENT, EXTRA_ACTIVITY)


@dataclass
class ContentBlock:
    id: UUID
    lesson_id: UUID
    type: str  # one of BLOCK_TYPES
    order_index: int
    # Which page of the lesson (or of the extra) the block is on.
    page_index: int = 0
    # Title, subtitle and paragraph text. Lists and tables keep their items
    # or rows here as JSON (see lesson_rules), never HTML.
    content: str | None = None
    # File name inside the lesson's folder of the private bucket, e.g.
    # "<hex>.png". Never a URL, see get_image in lesson_service.py.
    image_file: str | None = None
    # What the image shows, for whoever can't see it (HU-103).
    alt_text: str | None = None
    # Set when the block belongs to an extra of kind "contenido".
    extra_id: UUID | None = None


@dataclass
class QuestionOption:
    id: UUID
    text: str
    is_correct: bool
    order_index: int


@dataclass
class Question:
    id: UUID
    prompt: str
    order_index: int
    options: list[QuestionOption] = field(default_factory=list)


# The questions of a lesson (HU-80) or of an extra activity. pass_threshold
# is how many right answers it takes to pass.
@dataclass
class Activity:
    id: UUID
    pass_threshold: int
    questions: list[Question] = field(default_factory=list)


# More to read or one more activity after the lesson's own (HU-82), for
# every kid of the class or only for some (student_ids).
@dataclass
class Extra:
    id: UUID
    lesson_id: UUID
    kind: str  # one of EXTRA_KINDS
    title: str
    order_index: int
    for_everyone: bool = True
    student_ids: list[UUID] = field(default_factory=list)
    blocks: list[ContentBlock] = field(default_factory=list)
    activity: Activity | None = None


# A group of lessons about the same topic, like the sequences of the MEN,
# with the question that guides it (HU-101).
@dataclass
class Unit:
    id: UUID
    classroom_id: UUID
    teacher_id: UUID
    title: str
    guiding_question: str
    order_index: int


@dataclass
class Lesson:
    id: UUID
    classroom_id: UUID
    teacher_id: UUID
    unit_id: UUID
    title: str
    # The one sentence the mascot says when the kid opens it (HU-102).
    purpose: str
    # What the kid should be able to do after it, from the DBA (HU-102).
    learning_goal: str
    order_index: int
    status: str  # STATUS_DRAFT or STATUS_PUBLISHED
    # The lesson's own pages, extra blocks live in their extra.
    blocks: list[ContentBlock] = field(default_factory=list)
    activity: Activity | None = None
    extras: list[Extra] = field(default_factory=list)


# Where Caddy has to fetch a file from in Garage, with a signature that is
# only valid for that one GET. The service never reads the file itself.
@dataclass(frozen=True)
class SignedDownload:
    path: str
    authorization: str
    amz_date: str
    content_sha256: str


@dataclass
class ValidatedUser:
    # Result of validating a token against identity-service.
    subject_id: UUID
    role: str  # "guardian", "teacher" or "student". content-service only operates on teacher/student.
    extra: dict[str, object] = field(default_factory=dict)
