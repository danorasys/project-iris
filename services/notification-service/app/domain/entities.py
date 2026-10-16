# Domain entities. Plain dataclasses, no SQLAlchemy or FastAPI imports here.

from __future__ import annotations

import dataclasses
from datetime import datetime
from uuid import UUID

REQUEST_CREATED = "request.created"
REQUEST_RESOLVED = "request.resolved"
# The teacher took a kid out of the classroom (HU-76). Only for the guardian.
ENROLLMENT_REMOVED = "enrollment.removed"
# What a guardian does from the parents' portal (EP-07), only for the
# teacher: cancels a request still waiting, takes the kid out (HU-49), or
# writes to them (HU-48).
REQUEST_CANCELLED = "request.cancelled"
ENROLLMENT_WITHDRAWN = "enrollment.withdrawn"
MESSAGE_SENT = "message.sent"
# The teacher of the class left IRIS and a request still waiting was
# closed (HU-92). Only for the guardian.
REQUEST_CLOSED = "request.closed"
# The teacher writes to a kid or to their guardian (HU-77).
TEACHER_MESSAGE = "teacher.message"
# A new lesson, or a new extra of a published one, for the kids and their
# guardians (HU-83).
LESSON_PUBLISHED = "lesson.published"
EXTRA_PUBLISHED = "extra.published"
# The teacher archived, restored or deleted a class (HU-105, HU-85), for
# the guardians of its kids (HU-106). When archiving, a request that was
# waiting is closed and its notification says so.
CLASSROOM_ARCHIVED = "classroom.archived"
CLASSROOM_RESTORED = "classroom.restored"
CLASSROOM_DELETED = "classroom.deleted"
REQUEST_CLOSED_DECISION = "cerrada"
# What a kid finished, for their teacher (HU-69).
CONTENT_COMPLETED = "lesson.content_completed"
ACTIVITY_COMPLETED = "lesson.activity_completed"

# Sizes of any message, family's or teacher's: long like an email, with a
# top. Same as classroom-service.
SUBJECT_MAX_LENGTH = 300
BODY_MAX_LENGTH = 20000

# Who a notification is for. The same event can make one for the teacher
# of the classroom and another one for the guardian of the kid.
ROLE_TEACHER = "teacher"
ROLE_GUARDIAN = "guardian"
# The kid's own tray: new lessons and their teacher's messages.
ROLE_STUDENT = "student"

# The two boxes of a tray: what the person received and what they sent.
# What a teacher or a guardian sent is the copy they keep of their own
# messages (HU-51); a kid doesn't write any.
BOX_RECEIVED = "received"
BOX_SENT = "sent"
OWN_COPY_EVENT = {ROLE_TEACHER: TEACHER_MESSAGE, ROLE_GUARDIAN: MESSAGE_SENT}


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
    # Who sender_name names (never sent to the web), so their name can be
    # taken out when they delete their account; then sender_left is true.
    sender_id: UUID | None = None
    sender_left: bool = False
    # Only in a message, from a guardian (HU-48) or from the teacher (HU-77).
    subject: str | None = None
    body: str | None = None
    # The lesson it's about (HU-83, HU-69), and the extra if it's one.
    lesson_id: UUID | None = None
    lesson_title: str | None = None
    extra_title: str | None = None
    # The first try at the activity of a lesson (HU-69).
    score_correct: int | None = None
    score_total: int | None = None
    # Who a message went to: "student" or "guardian" for the teacher's,
    # "teacher" for the copy a guardian keeps of theirs.
    addressee: str | None = None
    # The conversation a message belongs to (HU-51).
    thread_id: UUID | None = None


# One page of someone's tray, plus the counts the portal shows.
@dataclasses.dataclass
class NotificationPage:
    items: list[Notification]
    total: int
    unread: int
