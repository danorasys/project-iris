"""REST contract for the teacher's notification tray: only the owning
teacher can list or mark their own notifications as read."""

from __future__ import annotations

import uuid

from httpx import AsyncClient

from app.application.notification_service import NotificationService
from app.infrastructure.uow import SqlAlchemyUnitOfWork
from tests.conftest import FakeIdentityClient


async def _create_notification(*, teacher_id: str, event: str = "request.created") -> None:
    service = NotificationService(uow_factory=SqlAlchemyUnitOfWork)
    payload = {
        "event": event,
        "classroom_id": str(uuid.uuid4()),
        "enrollment_id": str(uuid.uuid4()),
        "teacher_id": teacher_id,
    }
    if event == "request.created":
        payload["student_name"] = "Sofía"
    else:
        payload["decision"] = "aceptada"
    await service.record_event(payload)


async def test_list_requires_authentication(client: AsyncClient) -> None:
    response = await client.get("/notifications/me")

    assert response.status_code == 401


async def test_list_requires_teacher_role(client: AsyncClient, fake_identity_client: FakeIdentityClient) -> None:
    fake_identity_client.register("token-estudiante", sub=str(uuid.uuid4()), role="student")

    response = await client.get("/notifications/me", headers={"Authorization": "Bearer token-estudiante"})

    assert response.status_code == 403


async def test_list_returns_only_the_authenticated_teacher_s_notifications(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    teacher_id = str(uuid.uuid4())
    other_teacher_id = str(uuid.uuid4())
    fake_identity_client.register("token-docente-1", sub=teacher_id, role="teacher")

    await _create_notification(teacher_id=teacher_id)
    await _create_notification(teacher_id=other_teacher_id)

    response = await client.get("/notifications/me", headers={"Authorization": "Bearer token-docente-1"})

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["student_name"] == "Sofía"
    assert body[0]["read"] is False


async def test_mark_as_read_updates_the_flag(client: AsyncClient, fake_identity_client: FakeIdentityClient) -> None:
    teacher_id = str(uuid.uuid4())
    fake_identity_client.register("token-docente", sub=teacher_id, role="teacher")
    await _create_notification(teacher_id=teacher_id)

    listed = await client.get("/notifications/me", headers={"Authorization": "Bearer token-docente"})
    notification_id = listed.json()[0]["id"]

    response = await client.patch(
        f"/notifications/{notification_id}/read", headers={"Authorization": "Bearer token-docente"}
    )

    assert response.status_code == 200
    assert response.json()["read"] is True


async def test_mark_as_read_of_someone_elses_notification_is_forbidden(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    owner_id = str(uuid.uuid4())
    fake_identity_client.register("token-dueno", sub=owner_id, role="teacher")
    fake_identity_client.register("token-otro", sub=str(uuid.uuid4()), role="teacher")
    await _create_notification(teacher_id=owner_id)

    listed = await client.get("/notifications/me", headers={"Authorization": "Bearer token-dueno"})
    notification_id = listed.json()[0]["id"]

    response = await client.patch(
        f"/notifications/{notification_id}/read", headers={"Authorization": "Bearer token-otro"}
    )

    assert response.status_code == 403


async def test_mark_as_read_of_unknown_notification_is_not_found(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    fake_identity_client.register("token-docente", sub=str(uuid.uuid4()), role="teacher")

    response = await client.patch(
        f"/notifications/{uuid.uuid4()}/read", headers={"Authorization": "Bearer token-docente"}
    )

    assert response.status_code == 404
