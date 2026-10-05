# The teacher's portal, phase 1: the color of a classroom's avatar, the
# pending requests of each classroom, its members with their guardian,
# taking a student out, removing the logo and deleting a classroom.

from __future__ import annotations

import asyncio
import json

import fakeredis.aioredis
import pytest
from httpx import AsyncClient

from tests.fakes import FakeContentGateway, FakeIdentityGateway, FakeObjectStorage

PNG = b"\x89PNG\r\n\x1a\n" + b"datos-de-prueba"

pytestmark = pytest.mark.asyncio


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _create(client: AsyncClient, token: str, **body: object) -> dict:
    payload = {"name": "Matemáticas Básicas", "description": "Sumas y restas", **body}
    response = await client.post("/classrooms", json=payload, headers=_auth(token))
    assert response.status_code == 201, response.text
    result: dict = response.json()
    return result


async def _ask_to_join(client: AsyncClient, classroom: dict, token_student: str) -> str:
    response = await client.post(
        "/classrooms/enroll", json={"enrollment_code": classroom["enrollment_code"]}, headers=_auth(token_student)
    )
    assert response.status_code == 201, response.text
    enrollment_id: str = response.json()["enrollment_id"]
    return enrollment_id


async def _member(client: AsyncClient, classroom: dict, token_teacher: str, token_student: str) -> str:
    enrollment_id = await _ask_to_join(client, classroom, token_student)
    response = await client.post(
        f"/classrooms/{classroom['id']}/requests/{enrollment_id}/resolve",
        json={"decision": "aceptar"},
        headers=_auth(token_teacher),
    )
    assert response.status_code == 200
    return enrollment_id


async def _next_event(pubsub: fakeredis.aioredis.client.PubSub) -> dict:
    for _ in range(50):
        message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.1)
        if message is not None:
            event: dict = json.loads(message["data"])
            return event
        await asyncio.sleep(0.01)
    raise AssertionError("No llegó ningún evento al canal.")


# --- avatar color ---------------------------------------------------------


async def test_la_clase_nueva_es_azul_si_no_se_elige_color(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token, _ = identity_gateway.registrar_docente()

    classroom = await _create(client, token)

    assert classroom["color"] == "blue"


async def test_el_color_se_elige_al_crear_y_se_cambia_al_editar(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token, _ = identity_gateway.registrar_docente()
    classroom = await _create(client, token, color="green")

    response = await client.patch(f"/classrooms/{classroom['id']}", json={"color": "gold"}, headers=_auth(token))

    assert classroom["color"] == "green"
    assert response.status_code == 200
    assert response.json()["color"] == "gold"
    assert response.json()["name"] == "Matemáticas Básicas"


@pytest.mark.parametrize(
    "body",
    [{"color": "purple"}, {"name": "   "}, {"description": ""}, {"name": "Hola\u0000"}],
)
async def test_datos_de_clase_no_validos_dan_422(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, body: dict
) -> None:
    token, _ = identity_gateway.registrar_docente()

    response = await client.post(
        "/classrooms", json={"name": "Clase", "description": "d", **body}, headers=_auth(token)
    )

    assert response.status_code == 422


async def test_el_nombre_llega_sin_espacios_alrededor(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    token, _ = identity_gateway.registrar_docente()

    classroom = await _create(client, token, name="  Ciencias  ")

    assert classroom["name"] == "Ciencias"


# --- pending requests (HU-69) ---------------------------------------------


async def test_cada_clase_trae_sus_solicitudes_pendientes(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token, _ = identity_gateway.registrar_docente()
    with_requests = await _create(client, token, name="Con solicitudes")
    await _create(client, token, name="Sin solicitudes")
    token_a, _ = identity_gateway.registrar_estudiante_token(nombres="Ana")
    token_b, _ = identity_gateway.registrar_estudiante_token(nombres="Beto")
    token_c, _ = identity_gateway.registrar_estudiante_token(nombres="Caro")
    await _ask_to_join(client, with_requests, token_a)
    await _ask_to_join(client, with_requests, token_b)
    await _member(client, with_requests, token, token_c)

    response = await client.get("/classrooms", headers=_auth(token))

    pending = {c["name"]: c["pending_requests"] for c in response.json()}
    assert pending == {"Con solicitudes": 2, "Sin solicitudes": 0}


# --- members (HU-75) ------------------------------------------------------


async def test_los_miembros_traen_los_datos_de_su_tutor(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token, _ = identity_gateway.registrar_docente()
    classroom = await _create(client, token)
    token_student, _ = identity_gateway.registrar_estudiante_token(nombres="Sofía")
    await _member(client, classroom, token, token_student)

    response = await client.get(f"/classrooms/{classroom['id']}", headers=_auth(token))

    [student] = response.json()["students"]
    assert student["first_name"] == "Sofía"
    assert student["guardian_name"] == "Ana Pérez"
    assert student["guardian_email"] == "ana@example.com"
    assert student["guardian_phone"] == "3001234567"


async def test_un_estudiante_que_ya_no_existe_no_rompe_la_lista(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token, _ = identity_gateway.registrar_docente()
    classroom = await _create(client, token)
    token_student, student_id = identity_gateway.registrar_estudiante_token(nombres="Sofía")
    await _member(client, classroom, token, token_student)
    identity_gateway._students.pop(student_id)

    response = await client.get(f"/classrooms/{classroom['id']}", headers=_auth(token))

    assert response.status_code == 200
    [student] = response.json()["students"]
    assert student["first_name"] == "Estudiante sin datos"
    assert student["guardian_name"] is None


# --- taking a student out (HU-76) ----------------------------------------


async def test_retirar_a_un_estudiante_lo_saca_y_avisa_a_su_tutor(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    token, _ = identity_gateway.registrar_docente(nombre="Carlos Ruiz")
    classroom = await _create(client, token)
    token_student, _ = identity_gateway.registrar_estudiante_token(nombres="Sofía")
    enrollment_id = await _member(client, classroom, token, token_student)
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("classroom.requests")

    response = await client.delete(f"/classrooms/{classroom['id']}/students/{enrollment_id}", headers=_auth(token))

    assert response.status_code == 204
    detail = await client.get(f"/classrooms/{classroom['id']}", headers=_auth(token))
    assert detail.json()["students"] == []
    mine = await client.get("/classrooms/mine", headers=_auth(token_student))
    assert mine.json() == []
    event = await _next_event(pubsub)
    assert event["event"] == "enrollment.removed"
    assert event["guardian_id"] == str(identity_gateway.guardian_person_id)
    assert event["student_name"] == "Sofía"
    assert event["teacher_name"] == "Carlos Ruiz"
    assert event["classroom_name"] == "Matemáticas Básicas"
    await pubsub.aclose()


async def test_el_retirado_puede_volver_a_pedir_ingreso(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token, _ = identity_gateway.registrar_docente()
    classroom = await _create(client, token)
    token_student, _ = identity_gateway.registrar_estudiante_token()
    enrollment_id = await _member(client, classroom, token, token_student)
    await client.delete(f"/classrooms/{classroom['id']}/students/{enrollment_id}", headers=_auth(token))

    again = await client.post(
        "/classrooms/enroll", json={"enrollment_code": classroom["enrollment_code"]}, headers=_auth(token_student)
    )

    assert again.status_code == 201


async def test_no_se_retira_una_solicitud_pendiente_ni_de_una_clase_ajena(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token, _ = identity_gateway.registrar_docente()
    other_token, _ = identity_gateway.registrar_docente()
    classroom = await _create(client, token)
    token_student, _ = identity_gateway.registrar_estudiante_token()
    pending_id = await _ask_to_join(client, classroom, token_student)

    pending = await client.delete(f"/classrooms/{classroom['id']}/students/{pending_id}", headers=_auth(token))
    foreign = await client.delete(f"/classrooms/{classroom['id']}/students/{pending_id}", headers=_auth(other_token))

    assert pending.status_code == 404
    assert foreign.status_code == 403


# --- logo ----------------------------------------------------------------


async def test_quitar_el_logo_vuelve_a_las_iniciales_y_borra_el_archivo(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, object_storage: FakeObjectStorage
) -> None:
    token, _ = identity_gateway.registrar_docente()
    classroom = await _create(client, token)
    await client.post(
        f"/classrooms/{classroom['id']}/logo", files={"file": ("logo.png", PNG, "image/png")}, headers=_auth(token)
    )
    assert len(object_storage.archivos) == 1

    response = await client.delete(f"/classrooms/{classroom['id']}/logo", headers=_auth(token))

    assert response.status_code == 200
    assert response.json()["logo_file"] is None
    assert object_storage.archivos == {}


# --- deleting a classroom (HU-85) -----------------------------------------


async def test_eliminar_una_clase_borra_sus_lecciones_inscripciones_y_logo(
    client: AsyncClient,
    identity_gateway: FakeIdentityGateway,
    object_storage: FakeObjectStorage,
    content_gateway: FakeContentGateway,
) -> None:
    token, _ = identity_gateway.registrar_docente()
    classroom = await _create(client, token)
    await client.post(
        f"/classrooms/{classroom['id']}/logo", files={"file": ("logo.png", PNG, "image/png")}, headers=_auth(token)
    )
    token_student, _ = identity_gateway.registrar_estudiante_token()
    await _member(client, classroom, token, token_student)

    response = await client.delete(f"/classrooms/{classroom['id']}", headers=_auth(token))

    assert response.status_code == 204
    assert [str(c) for c in content_gateway.deleted] == [classroom["id"]]
    assert (await client.get(f"/classrooms/{classroom['id']}", headers=_auth(token))).status_code == 404
    assert (await client.get("/classrooms/mine", headers=_auth(token_student))).json() == []
    assert object_storage.archivos == {}


async def test_si_las_lecciones_no_se_pueden_borrar_la_clase_sigue_igual(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, content_gateway: FakeContentGateway
) -> None:
    token, _ = identity_gateway.registrar_docente()
    classroom = await _create(client, token)
    content_gateway.unavailable = True

    response = await client.delete(f"/classrooms/{classroom['id']}", headers=_auth(token))

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "contenido_no_disponible"
    assert (await client.get(f"/classrooms/{classroom['id']}", headers=_auth(token))).status_code == 200


async def test_no_se_elimina_una_clase_ajena(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, content_gateway: FakeContentGateway
) -> None:
    token, _ = identity_gateway.registrar_docente()
    other_token, _ = identity_gateway.registrar_docente()
    classroom = await _create(client, token)

    response = await client.delete(f"/classrooms/{classroom['id']}", headers=_auth(other_token))

    assert response.status_code == 403
    assert content_gateway.deleted == []
