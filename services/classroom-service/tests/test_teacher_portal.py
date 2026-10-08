# The teacher's portal, phase 1: the color of a classroom's avatar, the
# pending requests of each classroom, its members with their guardian,
# taking a student out, removing the logo and deleting a classroom.

from __future__ import annotations

import asyncio
import json
from uuid import UUID

import fakeredis.aioredis
import pytest
from httpx import AsyncClient
from sqlalchemy import update

from app.infrastructure.db import SessionLocal
from app.infrastructure.models import ClassroomModel
from tests.fakes import FakeContentGateway, FakeIdentityGateway, FakeObjectStorage

PNG = b"\x89PNG\r\n\x1a\n" + b"datos-de-prueba"

pytestmark = pytest.mark.asyncio


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _create(client: AsyncClient, token: str, **body: object) -> dict:
    payload = {"name": "Matemáticas Básicas", "description": "Sumas y restas", "area": "mathematics", "grade": 1, **body}
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
        "/classrooms",
        json={"name": "Clase", "description": "d", "area": "arts", "grade": 1, **body},
        headers=_auth(token),
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


async def test_cada_clase_trae_cuantos_estudiantes_tiene(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token, _ = identity_gateway.registrar_docente()
    with_students = await _create(client, token, name="Con estudiantes")
    await _create(client, token, name="Vacía")
    token_a, _ = identity_gateway.registrar_estudiante_token(nombres="Ana")
    token_b, _ = identity_gateway.registrar_estudiante_token(nombres="Beto")
    token_c, _ = identity_gateway.registrar_estudiante_token(nombres="Caro")
    await _member(client, with_students, token, token_a)
    await _member(client, with_students, token, token_b)
    # A request that is still waiting is not a student yet.
    await _ask_to_join(client, with_students, token_c)

    response = await client.get("/classrooms", headers=_auth(token))

    students = {c["name"]: c["student_count"] for c in response.json()}
    assert students == {"Con estudiantes": 2, "Vacía": 0}


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


# The lists the page refreshes by itself say so, and then they don't keep
# a teacher's panel open in identity-service.
async def test_lo_que_la_pagina_pide_sola_no_cuenta_como_actividad(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token, _ = identity_gateway.registrar_docente()

    await client.get("/classrooms", headers=_auth(token))
    await client.get("/classrooms", headers={**_auth(token), "X-Iris-Activity": "background"})

    assert identity_gateway.renews == [True, False]


# --- area and grade (HU-100) ---------------------------------------------


async def test_la_clase_lleva_su_area_y_su_grado(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    token, _ = identity_gateway.registrar_docente()

    classroom = await _create(client, token, area="mathematics", grade=2)
    listed = (await client.get("/classrooms", headers=_auth(token))).json()

    assert (classroom["area"], classroom["grade"]) == ("mathematics", 2)
    assert (listed[0]["area"], listed[0]["grade"]) == ("mathematics", 2)


@pytest.mark.parametrize("missing", ["area", "grade"])
async def test_sin_area_o_sin_grado_no_se_crea_la_clase(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, missing: str
) -> None:
    token, _ = identity_gateway.registrar_docente()
    body = {"name": "Clase", "description": "d", "area": "arts", "grade": 1}
    del body[missing]

    response = await client.post("/classrooms", json=body, headers=_auth(token))

    assert response.status_code == 422


async def test_editar_cambia_area_y_grado_pero_no_los_deja_vacios(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token, _ = identity_gateway.registrar_docente()
    classroom = await _create(client, token, area="natural_sciences", grade=1)
    url = f"/classrooms/{classroom['id']}"

    kept = await client.patch(url, json={"name": "Ciencias"}, headers=_auth(token))
    changed = await client.patch(url, json={"area": "arts", "grade": 3}, headers=_auth(token))
    cleared = await client.patch(url, json={"grade": None}, headers=_auth(token))

    # Leaving them out keeps them, sending them changes them, null is refused.
    assert (kept.json()["area"], kept.json()["grade"]) == ("natural_sciences", 1)
    assert (changed.json()["area"], changed.json()["grade"]) == ("arts", 3)
    assert cleared.status_code == 422


async def test_una_clase_de_antes_se_completa_al_editarla(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token, _ = identity_gateway.registrar_docente()
    classroom = await _create(client, token)
    # As if it had been created before area and grade existed.
    async with SessionLocal() as session:
        await session.execute(
            update(ClassroomModel).where(ClassroomModel.id == UUID(classroom["id"])).values(area=None, grade=None)
        )
        await session.commit()
    url = f"/classrooms/{classroom['id']}"

    without_them = await client.patch(url, json={"name": "Matemáticas"}, headers=_auth(token))
    with_them = await client.patch(url, json={"area": "mathematics", "grade": 4}, headers=_auth(token))

    assert without_them.status_code == 422
    assert without_them.json()["error"]["code"] == "clase_incompleta"
    assert (with_them.json()["area"], with_them.json()["grade"]) == ("mathematics", 4)


# Transición (0) isn't a primary school grade, and only one grade is taken.
@pytest.mark.parametrize("body", [{"area": "music"}, {"grade": 0}, {"grade": 6}, {"grade": [1, 2]}, {"grade": "uno"}])
async def test_area_o_grado_no_validos_dan_422(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, body: dict
) -> None:
    token, _ = identity_gateway.registrar_docente()

    response = await client.post(
        "/classrooms",
        json={"name": "Clase", "description": "d", "area": "arts", "grade": 1, **body},
        headers=_auth(token),
    )

    assert response.status_code == 422


# The description takes up to 2000 characters, not one more.
async def test_la_descripcion_llega_hasta_2000_caracteres(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token, _ = identity_gateway.registrar_docente()

    classroom = await _create(client, token, description="a" * 2000)
    too_long = await client.patch(f"/classrooms/{classroom['id']}", json={"description": "a" * 2001}, headers=_auth(token))

    assert len(classroom["description"]) == 2000
    assert too_long.status_code == 422


# --- "Otra" area, written by the teacher ----------------------------------


async def test_con_otra_area_se_escribe_cual_es(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    token, _ = identity_gateway.registrar_docente()

    without_it = await client.post(
        "/classrooms",
        json={"name": "Taller", "description": "d", "area": "other", "grade": 2},
        headers=_auth(token),
    )
    classroom = await _create(client, token, area="other", area_other="  Música  ")

    assert without_it.status_code == 422
    assert without_it.json()["error"]["code"] == "otra_area_requerida"
    assert (classroom["area"], classroom["area_other"]) == ("other", "Música")


async def test_el_area_escrita_solo_queda_con_otra(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    token, _ = identity_gateway.registrar_docente()

    # Sent with another area, it's simply not kept.
    classroom = await _create(client, token, area="arts", area_other="Música")

    assert classroom["area_other"] is None


async def test_editar_el_area_escrita_y_quitarla_al_cambiar_de_area(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token, _ = identity_gateway.registrar_docente()
    classroom = await _create(client, token, area="other", area_other="Música")
    url = f"/classrooms/{classroom['id']}"

    renamed = await client.patch(url, json={"area_other": "Danza"}, headers=_auth(token))
    to_maths = await client.patch(url, json={"area": "mathematics"}, headers=_auth(token))
    back_without_it = await client.patch(url, json={"area": "other"}, headers=_auth(token))
    too_long = await client.patch(url, json={"area": "other", "area_other": "a" * 61}, headers=_auth(token))

    assert renamed.json()["area_other"] == "Danza"
    assert (to_maths.json()["area"], to_maths.json()["area_other"]) == ("mathematics", None)
    assert back_without_it.status_code == 422
    assert too_long.status_code == 422
