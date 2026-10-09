# Deleting an account for good (HU-91, HU-92). The other services erase their
# part first and the account goes last, so if one of them fails nothing is lost
# here and trying again is safe (each call only deletes what's still there).

from __future__ import annotations

from typing import Callable
from uuid import UUID

from app.application.password_change import PasswordChangeService
from app.application.session_service import SessionService
from app.domain.exceptions import ResourceNotFound
from app.domain.ports import AccountErasure, UnitOfWork
from app.security_log import log_security_event

UowFactory = Callable[[], UnitOfWork]


class AccountErasureService:
    def __init__(
        self,
        uow_factory: UowFactory,
        passwords: PasswordChangeService,
        sessions: SessionService,
        erasure: AccountErasure,
    ) -> None:
        self._uow_factory = uow_factory
        self._passwords = passwords
        self._sessions = sessions
        self._erasure = erasure

    # HU-91: the guardian, their kids and their consents. The kids leave
    # every class, and their progress and notifications go too.
    async def delete_guardian(self, person_id: UUID, password: str) -> None:
        await self._passwords.verify_current_password(person_id, password)
        async with self._uow_factory() as uow:
            guardian = await uow.guardians.get_by_person_id(person_id)
            if guardian is None:
                raise ResourceNotFound("No existe un tutor asociado a esta cuenta.")
            kids = [s.id for s in await uow.students.list_by_guardian(guardian.id)]

        await self._erasure.erase_students(kids)
        await self._erasure.erase_notifications([person_id], kids)

        await self._sessions.revoke_all(person_id, "account_deleted")
        async with self._uow_factory() as uow:
            await uow.guardians.delete(guardian.id)
            await uow.commit()
        log_security_event("account_deleted", role="guardian", person=person_id, kids=len(kids))

    # HU-92: the teacher's personal data goes; their classes, lessons and
    # the kids in them stay, marked as without a teacher.
    async def delete_teacher(self, person_id: UUID, password: str) -> None:
        await self._passwords.verify_current_password(person_id, password)
        async with self._uow_factory() as uow:
            teacher = await uow.teachers.get_by_person_id(person_id)
            if teacher is None:
                raise ResourceNotFound("No existe un docente asociado a esta cuenta.")

        # Their classes know them by the id they sign in with.
        await self._erasure.teacher_left(person_id)
        await self._erasure.erase_notifications([person_id], [])

        await self._sessions.revoke_all(person_id, "account_deleted")
        async with self._uow_factory() as uow:
            await uow.teachers.delete(teacher.id)
            await uow.commit()
        log_security_event("account_deleted", role="teacher", person=person_id)
