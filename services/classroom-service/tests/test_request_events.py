# The events about enrollment requests that notification-service turns into
# notifications: besides the teacher, they now carry the kid, their guardian,
# the name of the classroom and who answered.

from __future__ import annotations

import asyncio
import json

import fakeredis.aioredis
from httpx import AsyncClient

from tests.fakes import FakeIdentityGateway


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _next_event(pubsub: fakeredis.aioredis.client.PubSub) -> dict:
    for _ in range(50):
        message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.1)
        if message is not None:
            event: dict = json.loads(message["data"])
            return event
        await asyncio.sleep(0.01)
    raise AssertionError("No llegó ningún evento al canal.")


async def _classroom_and_request(client: AsyncClient, identity: FakeIdentityGateway) -> tuple[str, dict, str]:
    token_docente, _ = identity.registrar_docente(nombre="Carlos Ruiz")
    token_estudiante, _ = identity.registrar_estudiante_token(nombres="Sofía")
    aula = await client.post(
        "/classrooms", json={"name": "Matemáticas 3A", "description": "d"}, headers=_auth(token_docente)
    )
    ingreso = await client.post(
        "/classrooms/enroll", json={"enrollment_code": aula.json()["enrollment_code"]}, headers=_auth(token_estudiante)
    )
    return token_docente, aula.json(), ingreso.json()["enrollment_id"]


async def test_la_solicitud_y_su_respuesta_llevan_al_tutor_y_al_aula(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("classroom.requests")
    token_docente, aula, enrollment_id = await _classroom_and_request(client, identity_gateway)
    creada = await _next_event(pubsub)

    await client.post(
        f"/classrooms/{aula['id']}/requests/{enrollment_id}/resolve",
        json={"decision": "aceptar"},
        headers=_auth(token_docente),
    )
    resuelta = await _next_event(pubsub)

    guardian_id = str(identity_gateway.guardian_person_id)
    assert creada["event"] == "request.created"
    assert creada["guardian_id"] == guardian_id
    assert creada["student_name"] == "Sofía"
    assert creada["classroom_name"] == "Matemáticas 3A"
    assert resuelta["event"] == "request.resolved"
    assert resuelta["decision"] == "aceptada"
    assert resuelta["guardian_id"] == guardian_id
    assert resuelta["student_id"] == creada["student_id"]
    assert resuelta["teacher_name"] == "Carlos Ruiz"
    await pubsub.aclose()


async def test_sin_identity_service_la_respuesta_sale_igual_para_el_docente(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    token_docente, aula, enrollment_id = await _classroom_and_request(client, identity_gateway)
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("classroom.requests")

    # Only the lookups for the event fail, the teacher's token is already cached.
    identity_gateway.obtener_estudiante = _unavailable  # type: ignore[method-assign]
    identity_gateway.obtener_nombre_docente = _unavailable  # type: ignore[method-assign]
    respuesta = await client.post(
        f"/classrooms/{aula['id']}/requests/{enrollment_id}/resolve",
        json={"decision": "rechazar"},
        headers=_auth(token_docente),
    )
    resuelta = await _next_event(pubsub)

    assert respuesta.status_code == 200
    assert resuelta["decision"] == "rechazada"
    assert "guardian_id" not in resuelta
    assert "teacher_name" not in resuelta
    await pubsub.aclose()


async def _unavailable(*_args: object) -> None:
    from app.domain.exceptions import IdentityServiceUnavailable

    raise IdentityServiceUnavailable()
