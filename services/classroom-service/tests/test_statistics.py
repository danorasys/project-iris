# The statistics of a class for its teacher (HU-86, HU-87): classroom-service
# says who is in the class and who they are, content-service counts.

from __future__ import annotations

import fakeredis.aioredis
from httpx import AsyncClient

from tests.fakes import FakeContentGateway, FakeIdentityGateway
from tests.helpers import auth, pedir_ingreso


async def _class_with_kids(client: AsyncClient, identity: FakeIdentityGateway, names: list[str]) -> tuple[str, dict]:
    teacher_token, _ = identity.registrar_docente()
    classroom = (
        await client.post(
            "/classrooms",
            json={"name": "Ciencias 1A", "description": "d", "area": "natural_sciences", "grade": 1},
            headers=auth(teacher_token),
        )
    ).json()
    for name in names:
        kid_token, _ = identity.registrar_estudiante_token(nombres=name)
        enrollment = (await pedir_ingreso(client, classroom["enrollment_code"], kid_token)).json()
        await client.post(
            f"/classrooms/{classroom['id']}/requests/{enrollment['enrollment_id']}/resolve",
            json={"decision": "aceptar"},
            headers=auth(teacher_token),
        )
    return teacher_token, classroom


async def test_el_docente_ve_las_estadisticas_con_el_nombre_de_cada_peque(
    client: AsyncClient,
    identity_gateway: FakeIdentityGateway,
    content_gateway: FakeContentGateway,
    redis_client: fakeredis.aioredis.FakeRedis,
) -> None:
    teacher_token, classroom = await _class_with_kids(client, identity_gateway, ["Sofía", "Tomás"])
    # A request still waiting isn't in the class, so it doesn't count.
    waiting_token, _ = identity_gateway.registrar_estudiante_token(nombres="Lucía")
    await pedir_ingreso(client, classroom["enrollment_code"], waiting_token)

    response = await client.get(f"/classrooms/{classroom['id']}/statistics", headers=auth(teacher_token))

    assert response.status_code == 200, response.text
    body = response.json()
    [(_classroom_id, asked)] = content_gateway.statistics_asked
    assert len(asked) == 2 and body["kids"] == 2
    assert sorted(k["first_name"] for k in body["lessons"][0]["kids"]) == ["Sofía", "Tomás"]
    assert sorted(k["first_name"] for k in body["by_kid"]) == ["Sofía", "Tomás"]


async def test_solo_el_docente_de_la_clase(
    client: AsyncClient,
    identity_gateway: FakeIdentityGateway,
    content_gateway: FakeContentGateway,
    redis_client: fakeredis.aioredis.FakeRedis,
) -> None:
    _teacher, classroom = await _class_with_kids(client, identity_gateway, ["Sofía"])
    other, _ = identity_gateway.registrar_docente()

    response = await client.get(f"/classrooms/{classroom['id']}/statistics", headers=auth(other))

    assert response.status_code in (403, 404)
    assert content_gateway.statistics_asked == []


async def test_sin_content_service_lo_dice(
    client: AsyncClient,
    identity_gateway: FakeIdentityGateway,
    content_gateway: FakeContentGateway,
    redis_client: fakeredis.aioredis.FakeRedis,
) -> None:
    teacher_token, classroom = await _class_with_kids(client, identity_gateway, ["Sofía"])
    content_gateway.unavailable = True

    response = await client.get(f"/classrooms/{classroom['id']}/statistics", headers=auth(teacher_token))

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "estadisticas_no_disponibles"
