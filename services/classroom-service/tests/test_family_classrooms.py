# The classes of a guardian's kids, for the Inicio of the parents' portal:
# only their own kids, the accepted and the pending ones (not the rejected),
# with the teacher's name and the published lessons, and behind the
# portal's 2FA code like the rest of the portal.

from __future__ import annotations

from uuid import UUID

import pytest
from httpx import AsyncClient

from tests.fakes import FakeContentGateway, FakeIdentityGateway

pytestmark = pytest.mark.asyncio


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _create(client: AsyncClient, token: str, name: str) -> dict:
    payload = {"name": name, "description": "Sumas y restas", "area": "mathematics", "grade": 2}
    response = await client.post("/classrooms", json=payload, headers=_auth(token))
    assert response.status_code == 201, response.text
    result: dict = response.json()
    return result


async def _ask(client: AsyncClient, classroom: dict, student_token: str) -> str:
    response = await client.post(
        "/classrooms/enroll", json={"enrollment_code": classroom["enrollment_code"]}, headers=_auth(student_token)
    )
    assert response.status_code == 201, response.text
    enrollment_id: str = response.json()["enrollment_id"]
    return enrollment_id


async def _answer(client: AsyncClient, classroom: dict, enrollment_id: str, teacher_token: str, decision: str) -> None:
    response = await client.post(
        f"/classrooms/{classroom['id']}/requests/{enrollment_id}/resolve",
        json={"decision": decision},
        headers=_auth(teacher_token),
    )
    assert response.status_code == 200, response.text


async def test_trae_las_clases_de_sus_peques_con_docente_y_lecciones(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, content_gateway: FakeContentGateway
) -> None:
    teacher_token, _ = identity_gateway.registrar_docente(nombre="Laura Gómez")
    math = await _create(client, teacher_token, "Matemáticas")
    science = await _create(client, teacher_token, "Ciencias")
    art = await _create(client, teacher_token, "Arte")
    content_gateway.published[UUID(math["id"])] = 3

    sofia_token, sofia = identity_gateway.registrar_estudiante_token(nombres="Sofía")
    tomas_token, tomas = identity_gateway.registrar_estudiante_token(nombres="Tomás")
    other_token, _other_kid = identity_gateway.registrar_estudiante_token(nombres="Otro")

    await _answer(client, math, await _ask(client, math, sofia_token), teacher_token, "aceptar")
    await _ask(client, science, tomas_token)  # still waiting
    await _answer(client, art, await _ask(client, art, tomas_token), teacher_token, "rechazar")
    await _ask(client, math, other_token)  # a kid of another family

    guardian_token, _ = identity_gateway.registrar_tutor_con_peques(sofia, tomas)
    response = await client.get("/classrooms/family", headers=_auth(guardian_token))

    assert response.status_code == 200, response.text
    body = response.json()
    # Newest first, and the rejected one isn't there.
    assert [(c["student_first_name"], c["name"], c["status"]) for c in body] == [
        ("Tomás", "Ciencias", "pendiente"),
        ("Sofía", "Matemáticas", "aceptada"),
    ]
    assert body[1]["teacher_name"] == "Laura Gómez"
    assert body[1]["published_lessons"] == 3
    assert body[0]["published_lessons"] == 0
    assert body[1]["grade"] == 2 and body[1]["area"] == "mathematics"
    # Nothing the family shouldn't get: no code to join, no logo.
    assert "enrollment_code" not in body[0] and "logo_file" not in body[0]


async def test_sin_peques_ni_clases_es_una_lista_vacia(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    no_kids, _ = identity_gateway.registrar_tutor_con_peques()
    _token, kid = identity_gateway.registrar_estudiante_token()
    kid_without_classes, _ = identity_gateway.registrar_tutor_con_peques(kid)

    for token in (no_kids, kid_without_classes):
        response = await client.get("/classrooms/family", headers=_auth(token))
        assert response.status_code == 200
        assert response.json() == []


async def test_pide_el_codigo_del_portal(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    token, _ = identity_gateway.registrar_tutor_con_peques()
    without_session, _ = identity_gateway.registrar_tutor_con_peques(sid=None)
    identity_gateway.portal_open = False

    closed = await client.get("/classrooms/family", headers=_auth(token))
    no_sid = await client.get("/classrooms/family", headers=_auth(without_session))

    for response in (closed, no_sid):
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "acceso_portal_requerido"


async def test_lo_que_la_pagina_pide_sola_no_deja_abierto_el_portal(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token, _ = identity_gateway.registrar_tutor_con_peques()

    await client.get("/classrooms/family", headers=_auth(token))
    await client.get("/classrooms/family", headers={**_auth(token), "X-Iris-Activity": "background"})

    assert identity_gateway.portal_renews == [True, False]


@pytest.mark.parametrize("role", ["teacher", "student"])
async def test_solo_para_tutores(client: AsyncClient, identity_gateway: FakeIdentityGateway, role: str) -> None:
    token = identity_gateway.registrar_docente()[0] if role == "teacher" else identity_gateway.registrar_estudiante_token()[0]

    response = await client.get("/classrooms/family", headers=_auth(token))

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "permiso_denegado"


async def test_sin_content_service_las_clases_igual_se_ven(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, content_gateway: FakeContentGateway
) -> None:
    teacher_token, _ = identity_gateway.registrar_docente()
    math = await _create(client, teacher_token, "Matemáticas")
    kid_token, kid = identity_gateway.registrar_estudiante_token()
    await _ask(client, math, kid_token)
    guardian_token, _ = identity_gateway.registrar_tutor_con_peques(kid)
    content_gateway.unavailable = True

    response = await client.get("/classrooms/family", headers=_auth(guardian_token))

    assert response.status_code == 200
    [classroom] = response.json()
    assert classroom["published_lessons"] is None
    assert classroom["teacher_name"] == "Carlos Ruiz"
