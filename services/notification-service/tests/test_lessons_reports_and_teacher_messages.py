# The notifications of Fase 2: the teacher's messages to a kid or their
# guardian (HU-77), a new lesson or extra for the class (HU-83), and what a
# kid finished, for the teacher (HU-69).

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from app.application.notification_service import NotificationService
from app.infrastructure.uow import SqlAlchemyUnitOfWork
from tests.conftest import FakeIdentityClient


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _record(payload: dict[str, object]) -> None:
    await NotificationService(uow_factory=SqlAlchemyUnitOfWork).record_event(payload)


def _people(identity: FakeIdentityClient) -> dict[str, str]:
    ids = {role: str(uuid.uuid4()) for role in ("teacher", "guardian", "student")}
    identity.register("token-docente", sub=ids["teacher"], role="teacher")
    identity.register("token-tutor", sub=ids["guardian"], role="guardian", session_id="sesion-1")
    identity.open_portals.add((ids["guardian"], "sesion-1"))
    identity.register("token-peque", sub=ids["student"], role="student")
    return ids


async def _tray(client: AsyncClient, token: str, **params: object) -> list[dict]:
    response = await client.get("/notifications/me", params=params, headers=_auth(token))
    assert response.status_code == 200, response.text
    items: list[dict] = response.json()["items"]
    return items


def _class_event(event: str, ids: dict[str, str], **extra: object) -> dict[str, object]:
    return {
        "event": event,
        "classroom_id": str(uuid.uuid4()),
        "classroom_name": "Ciencias 1A",
        "enrollment_id": str(uuid.uuid4()),
        "teacher_id": ids["teacher"],
        "teacher_name": "Carlos Ruiz",
        "student_id": ids["student"],
        "student_name": "Sofía",
        "guardian_id": ids["guardian"],
        **extra,
    }


# --- HU-77 ------------------------------------------------------------------


@pytest.mark.parametrize("recipient", ["student", "guardian"])
async def test_el_mensaje_del_docente_llega_a_quien_va_y_queda_una_copia(
    client: AsyncClient, fake_identity_client: FakeIdentityClient, recipient: str
) -> None:
    ids = _people(fake_identity_client)
    message = {"recipient": recipient, "subject": "Tarea", "body": "Repasen la lección 2."}
    await _record(_class_event("teacher.message", ids, **message))

    token = "token-peque" if recipient == "student" else "token-tutor"
    [received] = await _tray(client, token)
    [copy] = await _tray(client, "token-docente")
    other = await _tray(client, "token-tutor" if recipient == "student" else "token-peque")

    assert (received["subject"], received["body"], received["sender_name"]) == (
        "Tarea",
        "Repasen la lección 2.",
        "Carlos Ruiz",
    )
    assert received["read"] is False
    # What the teacher sent themselves: already read, saying to whom.
    assert (copy["event"], copy["addressee"], copy["read"]) == ("teacher.message", recipient, True)
    assert other == []


async def test_un_mensaje_sin_destinatario_valido_no_se_guarda(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    ids = _people(fake_identity_client)

    await _record(_class_event("teacher.message", ids, recipient="todos", subject="x", body="y"))

    assert await _tray(client, "token-docente") == []


async def test_los_mensajes_de_una_clase_se_filtran_por_tipo(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    ids = _people(fake_identity_client)
    classroom_id = str(uuid.uuid4())
    await _record(_class_event("teacher.message", ids, classroom_id=classroom_id, recipient="guardian", subject="a", body="b"))
    await _record(_class_event("message.sent", ids, classroom_id=classroom_id, subject="c", body="d"))
    await _record(_class_event("request.created", ids, classroom_id=classroom_id))

    messages = await _tray(
        client, "token-docente", classroom_id=classroom_id, event=["message.sent", "teacher.message"]
    )

    assert sorted(m["event"] for m in messages) == ["message.sent", "teacher.message"]


# --- HU-83 ------------------------------------------------------------------


async def test_una_leccion_nueva_llega_al_peque_y_a_su_tutor(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    ids = _people(fake_identity_client)
    lesson_id = str(uuid.uuid4())
    no_guardian = str(uuid.uuid4())
    await _record(
        {
            "event": "extra.published",
            "classroom_id": str(uuid.uuid4()),
            "classroom_name": "Ciencias 1A",
            "teacher_id": ids["teacher"],
            "teacher_name": "Carlos Ruiz",
            "lesson_id": lesson_id,
            "lesson_title": "Animales terrestres",
            "extra_title": "La granja",
            "members": [
                {
                    "enrollment_id": str(uuid.uuid4()),
                    "student_id": ids["student"],
                    "student_name": "Sofía",
                    "guardian_id": ids["guardian"],
                },
                # Without a known guardian only the kid gets it; a broken one is skipped.
                {"enrollment_id": str(uuid.uuid4()), "student_id": no_guardian},
                {"student_id": "no-es-un-id"},
            ],
        }
    )

    [for_kid] = await _tray(client, "token-peque")
    [for_guardian] = await _tray(client, "token-tutor")

    assert (for_kid["event"], for_kid["lesson_title"], for_kid["extra_title"]) == (
        "extra.published",
        "Animales terrestres",
        "La granja",
    )
    assert (for_guardian["lesson_id"], for_guardian["student_name"], for_guardian["sender_name"]) == (
        lesson_id,
        "Sofía",
        "Carlos Ruiz",
    )
    # The teacher doesn't hear about what they published themselves.
    assert await _tray(client, "token-docente") == []


# --- HU-69 ------------------------------------------------------------------


async def test_el_docente_recibe_lo_que_termino_el_peque(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    ids = _people(fake_identity_client)
    lesson = {"lesson_id": str(uuid.uuid4()), "lesson_title": "Animales terrestres"}
    await _record(_class_event("lesson.content_completed", ids, **lesson))
    await _record(_class_event("lesson.activity_completed", ids, correct=2, total=3, **lesson))

    activity, reading = await _tray(client, "token-docente")

    assert (reading["event"], reading["sender_name"], reading["correct"]) == ("lesson.content_completed", "Sofía", None)
    assert (activity["correct"], activity["total"], activity["lesson_title"]) == (2, 3, "Animales terrestres")
    # Only for the teacher.
    assert await _tray(client, "token-tutor") == []
