# When an account goes away (HU-91, HU-92), identity-service asks to erase
# every notification of those people and every one about their kids. And a
# request closed because the teacher left reaches the family (HU-92).

from __future__ import annotations

import uuid

from httpx import AsyncClient

from app.application.notification_service import NotificationService
from app.config import get_settings
from app.infrastructure.uow import SqlAlchemyUnitOfWork
from tests.conftest import FakeIdentityClient


def _internal() -> dict[str, str]:
    return {"X-Internal-Key": get_settings().internal_service_key}


async def _record(payload: dict[str, object]) -> None:
    await NotificationService(uow_factory=SqlAlchemyUnitOfWork).record_event(payload)


def _event(event: str, teacher: str, kid: str, guardian: str, **extra: object) -> dict[str, object]:
    return {
        "event": event,
        "classroom_id": str(uuid.uuid4()),
        "classroom_name": "Ciencias 1A",
        "enrollment_id": str(uuid.uuid4()),
        "teacher_id": teacher,
        "student_id": kid,
        "student_name": "Sofía",
        "guardian_id": guardian,
        **extra,
    }


async def _tray(client: AsyncClient, identity: FakeIdentityClient, person: str, role: str) -> list[dict]:
    token = f"token-{person}"
    identity.register(token, sub=person, role=role, session_id="s1")
    identity.open_portals.add((person, "s1"))
    items: list[dict] = (await client.get("/notifications/me", headers={"Authorization": f"Bearer {token}"})).json()[
        "items"
    ]
    return items


async def test_borrar_una_familia_quita_sus_bandejas_y_lo_que_habla_de_sus_peques(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    teacher, kid, guardian = (str(uuid.uuid4()) for _ in range(3))
    other_kid = str(uuid.uuid4())
    # The teacher hears about Sofía, the guardian about the answer, the kid gets a message.
    await _record(_event("request.created", teacher, kid, guardian))
    await _record(_event("request.resolved", teacher, kid, guardian, decision="aceptada"))
    await _record(_event("teacher.message", teacher, kid, guardian, recipient="student", subject="Hola", body="x"))
    # Another kid of the same teacher stays.
    await _record(_event("request.created", teacher, other_kid, str(uuid.uuid4())))

    response = await client.post(
        "/internal/erasures", json={"person_ids": [guardian], "student_ids": [kid]}, headers=_internal()
    )
    again = await client.post(
        "/internal/erasures", json={"person_ids": [guardian], "student_ids": [kid]}, headers=_internal()
    )

    # The teacher's 3 about Sofía (request, answer, copy of the message), the
    # guardian's answer and the kid's message.
    assert response.json() == {"notifications_deleted": 5}
    assert again.json() == {"notifications_deleted": 0}
    remaining = await _tray(client, fake_identity_client, teacher, "teacher")
    assert [n["student_id"] for n in remaining] == [other_kid]


async def test_borrar_es_solo_para_otros_servicios(client: AsyncClient) -> None:
    response = await client.post("/internal/erasures", json={"person_ids": [], "student_ids": []})

    assert response.status_code == 401


async def test_la_familia_sabe_que_su_solicitud_se_cerro(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    teacher, kid, guardian = (str(uuid.uuid4()) for _ in range(3))

    await _record(_event("request.closed", teacher, kid, guardian))

    [closed] = await _tray(client, fake_identity_client, guardian, "guardian")
    assert (closed["event"], closed["classroom_name"]) == ("request.closed", "Ciencias 1A")
    # Nothing for the teacher who left.
    assert await _tray(client, fake_identity_client, teacher, "teacher") == []


async def test_si_el_docente_se_va_sus_avisos_quedan_sin_su_nombre(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    teacher, kid, guardian = (str(uuid.uuid4()) for _ in range(3))
    other_teacher = str(uuid.uuid4())
    await _record(_event("request.resolved", teacher, kid, guardian, decision="aceptada", teacher_name="Laura Gómez"))
    await _record(
        _event(
            "teacher.message",
            teacher,
            kid,
            guardian,
            recipient="student",
            subject="Hola",
            body="x",
            teacher_name="Laura Gómez",
        )
    )
    await _record(
        {
            "event": "lesson.published",
            "classroom_id": str(uuid.uuid4()),
            "teacher_id": teacher,
            "teacher_name": "Laura Gómez",
            "lesson_id": str(uuid.uuid4()),
            "members": [{"enrollment_id": str(uuid.uuid4()), "student_id": kid, "guardian_id": guardian}],
        }
    )
    # Another teacher of the same kid keeps their name.
    await _record(_event("request.resolved", other_teacher, kid, guardian, decision="aceptada", teacher_name="Pedro"))

    response = await client.post(
        "/internal/erasures", json={"person_ids": [teacher], "student_ids": []}, headers=_internal()
    )

    assert response.status_code == 200
    family = await _tray(client, fake_identity_client, guardian, "guardian")
    by_sender = sorted((n["sender_name"] or "", n["sender_left"]) for n in family)
    assert by_sender == [("", True), ("", True), ("Pedro", False)]
    kid_tray = await _tray(client, fake_identity_client, kid, "student")
    assert {(n["sender_name"], n["sender_left"]) for n in kid_tray} == {(None, True)}
    # Who it was is never sent to the web.
    assert all("sender_id" not in n for n in family + kid_tray)
