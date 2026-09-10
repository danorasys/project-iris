from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

# The literal VALUES ("texto"/"imagen", "borrador"/"publicada") are kept in
# Spanish on purpose: they're data already stored in the database, this
# refactor only renames identifiers, not stored content.
BlockType = Literal["texto", "imagen"]
LessonStatus = Literal["borrador", "publicada"]


class ContentBlockInput(BaseModel):
    type: BlockType
    order_index: int = Field(ge=0)
    content: str | None = Field(default=None, max_length=20_000)
    image_url: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _validate_fields_by_type(self) -> "ContentBlockInput":
        if self.type == "texto" and not self.content:
            raise ValueError("Un bloque de tipo 'texto' requiere 'content'.")
        if self.type == "imagen" and not self.image_url:
            raise ValueError("Un bloque de tipo 'imagen' requiere 'image_url'.")
        return self


class CreateLessonRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    blocks: list[ContentBlockInput] = Field(default_factory=list)


class UpdateLessonRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    status: LessonStatus | None = None
    blocks: list[ContentBlockInput] | None = None


class ContentBlockResponse(BaseModel):
    id: UUID
    lesson_id: UUID
    type: str
    content: str | None = None
    image_url: str | None = None
    order_index: int


class LessonResponse(BaseModel):
    id: UUID
    classroom_id: UUID
    teacher_id: UUID
    title: str
    order_index: int
    status: str


class LessonDetailResponse(LessonResponse):
    blocks: list[ContentBlockResponse]


class ImageUploadResponse(BaseModel):
    image_url: str
