# Conversations (HU-51): a guardian and the teacher answer each other's
# messages inside one thread, and each sees it whole through their own tray.

from __future__ import annotations

import uuid

from httpx import AsyncClient

from app.application.notification_service import NotificationService
from app.infrastructure.uow import SqlAlchemyUnitOfWork
from tests.conftest import FakeIdentityClient


async def _record(payload: dict[str, object]) -> None:
    await NotificationService(uow_factory=SqlAlchemyUnitOfWork).record_event(payload)


def _people(identity: FakeIdentityClient) -> dict[str, str]:
    ids = {"teacher": str(uuid.uuid4()), "guardian": str(uuid.uuid4()), "kid": str(uuid.uuid4())}
    identity.register("token-docente", sub=ids["teacher"], role="teacher")
    identity.register("token-tutor", sub=ids["guardian"], role="guardian", session_id="s1")
    identity.open_portals.add((ids["guardian"], "s1"))
    return ids


def _message(event: str, ids: dict[str, str], enrollment: str, **extra: object) -> dict[str, object]:
    return {
        "event": event,
        "classroom_id": str(uuid.uuid4()),
        "enrollment_id": enrollment,
        "teacher_id": ids["teacher"],
        "teacher_name": "Laura Gómez",
        "student_id": ids["kid"],
        "student_name": "Sofía",
        "guardian_id": ids["guardian"],
        "guardian_name": "Ana Pérez",
        **extra,
    }


async def _thread(client: AsyncClient, token: str, thread: str) -> list[dict]:
    response = await client.get(f"/notifications/me/threads/{thread}", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200, response.text
    items: list[dict] = response.json()
    return items


async def test_una_conversacion_se_lee_entera_y_en_orden_desde_los_dos_lados(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    ids = _people(fake_identity_client)
    enrollment = str(uuid.uuid4())
    thread = str(uuid.uuid4())
    await _record(_message("message.sent", ids, enrollment, thread_id=thread, subject="Tarea", body="¿Hay tarea?"))
    await _record(
        _message(
            "teacher.message", ids, enrollment, thread_id=thread, reply=True, recipient="guardian",
            subject="Re: Tarea", body="Sí, la página 3.",
        )
    )
    await _record(_message("message.sent", ids, enrollment, thread_id=thread, reply=True, subject="Re: Tarea", body="¡Gracias!"))

    teacher = await _thread(client, "token-docente", thread)
    guardian = await _thread(client, "token-tutor", thread)

    assert [m["body"] for m in teacher] == ["¿Hay tarea?", "Sí, la página 3.", "¡Gracias!"]
    assert [m["body"] for m in guardian] == ["¿Hay tarea?", "Sí, la página 3.", "¡Gracias!"]
    # Each one sees what they sent as a copy already read.
    assert [m["read"] for m in guardian] == [True, False, True]


async def test_no_se_puede_entrar_en_la_conversacion_de_otro(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    ids = _people(fake_identity_client)
    thread = str(uuid.uuid4())
    await _record(_message("message.sent", ids, str(uuid.uuid4()), thread_id=thread, subject="a", body="mío"))
    # Another family "answers" with that thread id, about another kid.
    stranger = {**ids, "guardian": str(uuid.uuid4())}
    await _record(_message("message.sent", stranger, str(uuid.uuid4()), thread_id=thread, reply=True, subject="b", body="intruso"))

    teacher = await _thread(client, "token-docente", thread)

    assert [m["body"] for m in teacher] == ["mío"]


async def test_un_hilo_que_no_es_tuyo_no_existe(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    _people(fake_identity_client)

    response = await client.get(
        f"/notifications/me/threads/{uuid.uuid4()}", headers={"Authorization": "Bearer token-docente"}
    )

    assert response.status_code == 404
