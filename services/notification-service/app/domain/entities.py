"""Domain entities. Plain dataclasses, no SQLAlchemy or FastAPI imports here."""

from __future__ import annotations

import dataclasses
from datetime import datetime
from uuid import UUID

REQUEST_CREATED = "request.created"
REQUEST_RESOLVED = "request.resolved"


@dataclasses.dataclass
class Notification:
    id: UUID
    teacher_id: UUID
    event: str
    classroom_id: UUID
    enrollment_id: UUID
    student_name: str | None
    decision: str | None
    read: bool
    created_at: datetime
