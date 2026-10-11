# A teacher archives, restores or deletes a class (HU-105, HU-85): each
# guardian of its kids gets a notice (HU-106), the kids and the teacher
# don't. When archiving, a family whose request was closed is told so.

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from app.application.notification_service import NotificationService
from app.infrastructure.uow import SqlAlchemyUnitOfWork
from tests.conftest import FakeIdentityClient


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _tray(client: AsyncClient, token: str) -> list[dict]:
    response = await client.get("/notifications/me", headers=_auth(token))
    assert response.status_code == 200, response.text
    items: list[dict] = response.json()["items"]
    return items


def _people(identity: FakeIdentityClient) -> dict[str, str]:
    ids = {role: str(uuid.uuid4()) for role in ("teacher", "guardian", "student")}
    identity.register("token-docente", sub=ids["teacher"], role="teacher")
    identity.register("token-tutor", sub=ids["guardian"], role="guardian", session_id="sesion-1")
    identity.open_portals.add((ids["guardian"], "sesion-1"))
    identity.register("token-peque", sub=ids["student"], role="student")
    return ids


def _change(event: str, ids: dict[str, str], **member: object) -> dict[str, object]:
    return {
        "event": event,
        "classroom_id": str(uuid.uuid4()),
        "classroom_name": "Ciencias 1A",
        "teacher_id": ids["teacher"],
        "teacher_name": "Carlos Ruiz",
        "members": [
            {
                "enrollment_id": str(uuid.uuid4()),
                "student_id": ids["student"],
                "student_name": "Sofía",
                "guardian_id": ids["guardian"],
                **member,
            }
        ],
    }


@pytest.mark.parametrize("event", ["classroom.archived", "classroom.restored", "classroom.deleted"])
async def test_solo_el_tutor_se_entera_del_cambio_de_la_clase(
    client: AsyncClient, fake_identity_client: FakeIdentityClient, event: str
) -> None:
    ids = _people(fake_identity_client)

    await NotificationService(uow_factory=SqlAlchemyUnitOfWork).record_event(_change(event, ids))

    [notice] = await _tray(client, "token-tutor")
    assert (notice["event"], notice["classroom_name"], notice["sender_name"], notice["student_name"]) == (
        event,
        "Ciencias 1A",
        "Carlos Ruiz",
        "Sofía",
    )
    assert notice["decision"] is None
    assert await _tray(client, "token-peque") == []
    assert await _tray(client, "token-docente") == []


async def test_al_archivar_la_solicitud_cerrada_lo_dice(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    ids = _people(fake_identity_client)

    await NotificationService(uow_factory=SqlAlchemyUnitOfWork).record_event(
        _change("classroom.archived", ids, request_closed=True)
    )

    [notice] = await _tray(client, "token-tutor")
    assert notice["decision"] == "cerrada"
