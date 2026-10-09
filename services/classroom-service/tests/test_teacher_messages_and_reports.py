# What a class tells its families and its teacher besides the requests: the
# teacher's messages to a kid or their guardian (HU-77), the notice of a new
# lesson for everyone in the class (HU-83), and what a kid finished, for the
# teacher (HU-69). All of it leaves as events that notification-service
# turns into notifications.

from __future__ import annotations

import asyncio
import json
from uuid import uuid4

import fakeredis.aioredis
import pytest
from httpx import AsyncClient

from app.config import get_settings
from tests.fakes import FakeIdentityGateway
from tests.helpers import auth, pedir_ingreso


async def _next_event(pubsub: fakeredis.aioredis.client.PubSub) -> dict:
    for _ in range(50):
        message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.1)
        if message is not None:
            event: dict = json.loads(message["data"])
            return event
        await asyncio.sleep(0.01)
    raise AssertionError("No llegó ningún evento al canal.")


async def _unavailable(*_args: object) -> None:
    from app.domain.exceptions import IdentityServiceUnavailable

    raise IdentityServiceUnavailable()


def _internal() -> dict[str, str]:
    return {"X-Internal-Key": get_settings().internal_service_key}


# A class with one kid already in it: the teacher's token, the classroom,
# the enrollment and the kid.
async def _class_with_kid(client: AsyncClient, identity: FakeIdentityGateway, kid_name: str = "Sofía") -> tuple:
    teacher_token, _ = identity.registrar_docente(nombre="Carlos Ruiz")
    kid_token, kid_id = identity.registrar_estudiante_token(nombres=kid_name)
    classroom = (
        await client.post(
            "/classrooms",
            json={"name": "Ciencias 1A", "description": "d", "area": "natural_sciences", "grade": 1},
            headers=auth(teacher_token),
        )
    ).json()
    enrollment_id = (await pedir_ingreso(client, classroom["enrollment_code"], kid_token)).json()["enrollment_id"]
    await client.post(
        f"/classrooms/{classroom['id']}/requests/{enrollment_id}/resolve",
        json={"decision": "aceptar"},
        headers=auth(teacher_token),
    )
    return teacher_token, classroom, enrollment_id, kid_id


async def _subscribed(redis_client: fakeredis.aioredis.FakeRedis) -> fakeredis.aioredis.client.PubSub:
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("classroom.requests")
    return pubsub


# ---------------------------------------------------------------------------
# HU-77: the teacher's messages
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("recipient", ["student", "guardian"])
async def test_el_docente_le_escribe_al_peque_o_a_su_tutor(
    client: AsyncClient,
    identity_gateway: FakeIdentityGateway,
    redis_client: fakeredis.aioredis.FakeRedis,
    recipient: str,
) -> None:
    teacher_token, classroom, enrollment_id, kid_id = await _class_with_kid(client, identity_gateway)
    pubsub = await _subscribed(redis_client)

    response = await client.post(
        f"/classrooms/{classroom['id']}/students/{enrollment_id}/messages",
        json={"recipient": recipient, "subject": "  Tarea  ", "body": "Repasen la lección 2."},
        headers=auth(teacher_token),
    )
    event = await _next_event(pubsub)

    assert response.status_code == 204, response.text
    assert event["event"] == "teacher.message"
    assert event["recipient"] == recipient
    assert (event["subject"], event["body"]) == ("Tarea", "Repasen la lección 2.")
    assert event["student_id"] == str(kid_id) and event["student_name"] == "Sofía"
    assert event["guardian_id"] == str(identity_gateway.guardian_person_id)
    assert (event["teacher_name"], event["classroom_name"]) == ("Carlos Ruiz", "Ciencias 1A")
    await pubsub.aclose()


async def test_solo_a_los_peques_de_sus_propias_clases(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    _teacher_token, classroom, enrollment_id, _kid = await _class_with_kid(client, identity_gateway)
    other_teacher, _ = identity_gateway.registrar_docente()
    message = {"recipient": "student", "subject": "Hola", "body": "Hola"}

    foreign = await client.post(
        f"/classrooms/{classroom['id']}/students/{enrollment_id}/messages", json=message, headers=auth(other_teacher)
    )
    unknown = await client.post(
        f"/classrooms/{classroom['id']}/students/{uuid4()}/messages", json=message, headers=auth(_teacher_token)
    )

    assert foreign.status_code in (403, 404)
    assert unknown.status_code == 404


async def test_sin_saber_quien_es_el_tutor_su_mensaje_no_sale(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    teacher_token, classroom, enrollment_id, _kid = await _class_with_kid(client, identity_gateway)
    # Only the lookup of the kid and their guardian fails.
    identity_gateway.obtener_estudiante = _unavailable  # type: ignore[method-assign]

    response = await client.post(
        f"/classrooms/{classroom['id']}/students/{enrollment_id}/messages",
        json={"recipient": "guardian", "subject": "Hola", "body": "Hola"},
        headers=auth(teacher_token),
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "mensaje_no_enviado"


# ---------------------------------------------------------------------------
# HU-83: a new lesson for the whole class
# ---------------------------------------------------------------------------


async def test_una_leccion_nueva_va_a_cada_peque_y_su_tutor(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    _teacher, classroom, enrollment_id, kid_id = await _class_with_kid(client, identity_gateway)
    lesson_id = uuid4()
    pubsub = await _subscribed(redis_client)

    response = await client.post(
        f"/internal/classrooms/{classroom['id']}/announcements",
        json={"kind": "lesson.published", "lesson_id": str(lesson_id), "lesson_title": "Animales terrestres"},
        headers=_internal(),
    )
    event = await _next_event(pubsub)

    assert response.status_code == 204, response.text
    assert (event["event"], event["lesson_title"], event["lesson_id"]) == (
        "lesson.published",
        "Animales terrestres",
        str(lesson_id),
    )
    assert event["members"] == [
        {
            "enrollment_id": enrollment_id,
            "student_id": str(kid_id),
            "student_name": "Sofía",
            "guardian_id": str(identity_gateway.guardian_person_id),
        }
    ]
    assert event["teacher_name"] == "Carlos Ruiz"
    await pubsub.aclose()


async def test_un_extra_solo_para_algunos_va_solo_a_ellos(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    _teacher, classroom, _enrollment, _kid = await _class_with_kid(client, identity_gateway)
    pubsub = await _subscribed(redis_client)

    # Nobody in the class is in the list: no event at all.
    response = await client.post(
        f"/internal/classrooms/{classroom['id']}/announcements",
        json={
            "kind": "extra.published",
            "lesson_id": str(uuid4()),
            "lesson_title": "Animales",
            "extra_title": "La granja",
            "student_ids": [str(uuid4())],
        },
        headers=_internal(),
    )

    assert response.status_code == 204
    assert await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.2) is None
    await pubsub.aclose()


async def test_los_avisos_son_solo_para_otros_servicios(client: AsyncClient) -> None:
    body = {"kind": "lesson.published", "lesson_id": str(uuid4()), "lesson_title": "Animales"}

    response = await client.post(f"/internal/classrooms/{uuid4()}/announcements", json=body)

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# HU-69: what a kid finished, for their teacher
# ---------------------------------------------------------------------------


async def test_el_docente_se_entera_de_lo_que_termina_un_peque(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    _teacher, classroom, enrollment_id, kid_id = await _class_with_kid(client, identity_gateway)
    pubsub = await _subscribed(redis_client)

    response = await client.post(
        f"/internal/classrooms/{classroom['id']}/students/{kid_id}/reports",
        json={
            "kind": "lesson.activity_completed",
            "lesson_id": str(uuid4()),
            "lesson_title": "Animales",
            "correct": 2,
            "total": 3,
        },
        headers=_internal(),
    )
    event = await _next_event(pubsub)

    assert response.status_code == 204, response.text
    assert event["event"] == "lesson.activity_completed"
    assert (event["enrollment_id"], event["student_name"]) == (enrollment_id, "Sofía")
    assert (event["correct"], event["total"]) == (2, 3)
    assert "guardian_id" not in event
    await pubsub.aclose()


async def test_un_peque_que_no_esta_en_la_clase_no_se_reporta(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    _teacher, classroom, _enrollment, _kid = await _class_with_kid(client, identity_gateway)

    response = await client.post(
        f"/internal/classrooms/{classroom['id']}/students/{uuid4()}/reports",
        json={"kind": "lesson.content_completed", "lesson_id": str(uuid4()), "lesson_title": "Animales"},
        headers=_internal(),
    )

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# HU-51: answering inside a conversation
# ---------------------------------------------------------------------------


async def test_un_mensaje_nuevo_abre_un_hilo_y_una_respuesta_lo_sigue(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    teacher_token, classroom, enrollment_id, _kid = await _class_with_kid(client, identity_gateway)
    url = f"/classrooms/{classroom['id']}/students/{enrollment_id}/messages"
    pubsub = await _subscribed(redis_client)

    await client.post(url, json={"recipient": "guardian", "subject": "Hola", "body": "x"}, headers=auth(teacher_token))
    first = await _next_event(pubsub)
    await client.post(
        url,
        json={"recipient": "guardian", "subject": "Re: Hola", "body": "y", "thread_id": first["thread_id"]},
        headers=auth(teacher_token),
    )
    answer = await _next_event(pubsub)

    assert "reply" not in first and first["thread_id"]
    assert (answer["thread_id"], answer["reply"]) == (first["thread_id"], True)
    await pubsub.aclose()
