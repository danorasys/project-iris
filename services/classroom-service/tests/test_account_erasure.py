# What classroom-service does when an account goes away: a guardian's kids
# leave every class (HU-91), and a teacher's classes stay for their kids
# without a teacher (HU-92). identity-service asks for both before deleting.

from __future__ import annotations

import asyncio
import json
from uuid import uuid4

import fakeredis.aioredis
from httpx import AsyncClient

from app.config import get_settings
from tests.fakes import FakeIdentityGateway
from tests.helpers import auth, pedir_ingreso


def _internal() -> dict[str, str]:
    return {"X-Internal-Key": get_settings().internal_service_key}


async def _classroom(client: AsyncClient, teacher_token: str) -> dict:
    response = await client.post(
        "/classrooms",
        json={"name": "Ciencias 1A", "description": "d", "area": "natural_sciences", "grade": 1},
        headers=auth(teacher_token),
    )
    classroom: dict = response.json()
    return classroom


async def _join(client: AsyncClient, teacher_token: str, classroom: dict, kid_token: str, accept: bool = True) -> str:
    enrollment_id: str = (await pedir_ingreso(client, classroom["enrollment_code"], kid_token)).json()["enrollment_id"]
    if accept:
        await client.post(
            f"/classrooms/{classroom['id']}/requests/{enrollment_id}/resolve",
            json={"decision": "aceptar"},
            headers=auth(teacher_token),
        )
    return enrollment_id


async def _next_event(pubsub: fakeredis.aioredis.client.PubSub) -> dict:
    for _ in range(50):
        message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.1)
        if message is not None:
            event: dict = json.loads(message["data"])
            return event
        await asyncio.sleep(0.01)
    raise AssertionError("No llegó ningún evento al canal.")


# ---------------------------------------------------------------------------
# HU-91: a guardian's kids
# ---------------------------------------------------------------------------


async def test_los_peques_de_un_tutor_borrado_salen_de_todas_sus_clases(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    teacher_token, _ = identity_gateway.registrar_docente()
    first, second = await _classroom(client, teacher_token), await _classroom(client, teacher_token)
    kid_token, kid = identity_gateway.registrar_estudiante_token(nombres="Sofía")
    other_token, _ = identity_gateway.registrar_estudiante_token(nombres="Tomás")
    await _join(client, teacher_token, first, kid_token)
    await _join(client, teacher_token, second, kid_token, accept=False)
    await _join(client, teacher_token, first, other_token)

    erased = await client.post("/internal/erasures/students", json={"student_ids": [str(kid)]}, headers=_internal())
    again = await client.post("/internal/erasures/students", json={"student_ids": [str(kid)]}, headers=_internal())
    members = (await client.get(f"/classrooms/{first['id']}", headers=auth(teacher_token))).json()["students"]
    waiting = (await client.get(f"/classrooms/{second['id']}/requests", headers=auth(teacher_token))).json()

    assert erased.json() == {"enrollments_deleted": 2}
    assert again.json() == {"enrollments_deleted": 0}
    assert [m["first_name"] for m in members] == ["Tomás"]
    assert waiting == []


async def test_borrar_es_solo_para_otros_servicios(client: AsyncClient) -> None:
    students = await client.post("/internal/erasures/students", json={"student_ids": []})
    teacher = await client.post(f"/internal/erasures/teachers/{uuid4()}")

    assert (students.status_code, teacher.status_code) == (401, 401)


# ---------------------------------------------------------------------------
# HU-92: a teacher's classes
# ---------------------------------------------------------------------------


async def test_las_clases_de_un_docente_borrado_quedan_para_sus_peques(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    teacher_token, teacher_id = identity_gateway.registrar_docente()
    classroom = await _classroom(client, teacher_token)
    kid_token, kid = identity_gateway.registrar_estudiante_token(nombres="Sofía")
    waiting_token, _ = identity_gateway.registrar_estudiante_token(nombres="Tomás")
    await _join(client, teacher_token, classroom, kid_token)
    await _join(client, teacher_token, classroom, waiting_token, accept=False)
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("classroom.requests")

    left = await client.post(f"/internal/erasures/teachers/{teacher_id}", headers=_internal())
    closed = await _next_event(pubsub)
    again = await client.post(f"/internal/erasures/teachers/{teacher_id}", headers=_internal())

    assert left.status_code == again.status_code == 204
    # The family that was waiting hears why.
    assert (closed["event"], closed["student_name"], closed["classroom_name"]) == (
        "request.closed",
        "Tomás",
        "Ciencias 1A",
    )
    assert closed["guardian_id"] == str(identity_gateway.guardian_person_id)
    # The kid already in it keeps it, and sees it has no teacher now.
    [mine] = (await client.get("/classrooms/mine", headers=auth(kid_token))).json()
    assert mine["has_teacher"] is False
    access = await client.get(
        f"/internal/classrooms/{classroom['id']}/access",
        params={"subject_id": str(kid), "role": "student"},
        headers=_internal(),
    )
    assert access.json() == {"authorized": True}
    await pubsub.aclose()


async def test_una_clase_sin_docente_no_recibe_solicitudes_ni_cambios(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    teacher_token, teacher_id = identity_gateway.registrar_docente()
    classroom = await _classroom(client, teacher_token)
    await client.post(f"/internal/erasures/teachers/{teacher_id}", headers=_internal())
    kid_token, _ = identity_gateway.registrar_estudiante_token(nombres="Sofía")
    guardian = identity_gateway.tutor_de(kid_token)

    lookup = await client.post(
        "/classrooms/family/lookup", json={"enrollment_code": classroom["enrollment_code"]}, headers=auth(guardian)
    )
    request = await pedir_ingreso(client, classroom["enrollment_code"], kid_token)
    # Even with a session that's still open, the class can't be changed.
    edit = await client.patch(f"/classrooms/{classroom['id']}", json={"name": "Otra"}, headers=auth(teacher_token))

    assert lookup.status_code == request.status_code == edit.status_code == 409
    assert lookup.json()["error"]["code"] == "clase_sin_docente"
