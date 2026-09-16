# Domain entities.
#
# Plain dataclasses, no FastAPI or SQLAlchemy dependency.
#
# The enum-like string VALUES stored in `status` and `type` ("borrador",
# "publicada", "texto", "imagen") are kept in Spanish on purpose: they're
# existing data already persisted in the database, so only identifiers
# (classes, columns, fields) got renamed, not the stored content. Changing
# them would need a data migration, not just a rename.

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID


@dataclass
class ContentBlock:
    id: UUID
    lesson_id: UUID
    type: str  # "texto" | "imagen" (stored value, kept as-is, see note below)
    order_index: int
    content: str | None = None
    image_url: str | None = None


@dataclass
class Lesson:
    id: UUID
    classroom_id: UUID
    teacher_id: UUID
    title: str
    order_index: int
    status: str  # "borrador" | "publicada" (stored value, kept as-is, see note below)
    blocks: list[ContentBlock] = field(default_factory=list)


@dataclass
class ValidatedUser:
    # Result of validating a token against identity-service.
    subject_id: UUID
    role: str  # "guardian", "teacher" or "student". content-service only operates on teacher/student.
    extra: dict[str, object] = field(default_factory=dict)
