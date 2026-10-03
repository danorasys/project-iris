# Domain entities. Plain dataclasses, no SQLAlchemy or FastAPI imports here.

from __future__ import annotations

import dataclasses
from datetime import datetime
from uuid import UUID

REQUEST_CREATED = "request.created"
REQUEST_RESOLVED = "request.resolved"

# Who a notification is for. The same event can make one for the teacher
# of the classroom and another one for the guardian of the kid.
ROLE_TEACHER = "teacher"
ROLE_GUARDIAN = "guardian"


@dataclasses.dataclass
class Notification:
    id: UUID
    # The person who gets it, the id they sign in with.
    recipient_id: UUID
    recipient_role: str
    event: str
    classroom_id: UUID
    enrollment_id: UUID
    student_name: str | None
    decision: str | None
    read: bool
    created_at: datetime
    # Copied from the event when it arrives, so the tray can say which kid,
    # which classroom and who it's from without asking the other services.
    student_id: UUID | None = None
    classroom_name: str | None = None
    sender_name: str | None = None


# One page of someone's tray, plus the counts the portal shows.
@dataclasses.dataclass
class NotificationPage:
    items: list[Notification]
    total: int
    unread: int
