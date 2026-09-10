from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ContentBlockInput:
    type: str
    order_index: int
    content: str | None = None
    image_url: str | None = None
