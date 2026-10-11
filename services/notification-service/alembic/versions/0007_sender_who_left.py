"""notifications.sender_id and sender_left: no name of someone who left

sender_name is copied into each notice when it arrives, so a teacher who
deletes their account (HU-92) stayed named in the families' and kids'
trays. Now each notice keeps who that name is (sender_id, never sent to the
web), and deleting the account blanks the name and marks sender_left, so
the portal says it was a teacher who's no longer in IRIS.

Older notices get sender_id from their class: in a family's or a kid's
tray the name is the class's teacher (except in the old "request sent",
which named the kid), and a class keeps the same teacher for good, the one
who gets its notices in their own tray. A class whose teacher has nothing
left in their tray can't be filled.

No index: it's only read when an account is deleted.

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-11
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("notifications", sa.Column("sender_id", sa.Uuid(), nullable=True))
    op.add_column("notifications", sa.Column("sender_left", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute(
        """
        UPDATE notifications AS n
        SET sender_id = t.recipient_id
        FROM (
            SELECT DISTINCT classroom_id, recipient_id
            FROM notifications
            WHERE recipient_role = 'teacher'
        ) AS t
        WHERE n.classroom_id = t.classroom_id
          AND n.recipient_role IN ('guardian', 'student')
          AND n.event <> 'request.created'
          AND n.sender_name IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_column("notifications", "sender_left")
    op.drop_column("notifications", "sender_id")
