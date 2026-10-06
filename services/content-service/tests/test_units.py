# Units of a classroom (HU-101, HU-104): who can create and see them, their
# order, and that a unit with lessons can't be deleted.

from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient

from tests.fakes import FakeClassroomClient, FakeIdentityClient
from tests.helpers import auth, lesson, published_lesson, student, teacher, unit

pytestmark = pytest.mark.asyncio


async def test_el_docente_crea_unidades_que_quedan_en_orden(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)

    first = await unit(client, who, "Los animales")
    second = await unit(client, who, "Las plantas")
    listed = await client.get(f"/classrooms/{who.classroom_id}/units", headers=auth(who.token))

    assert (first["order_index"], second["order_index"]) == (0, 1)
    assert [u["title"] for u in listed.json()] == ["Los animales", "Las plantas"]
    assert listed.json()[0]["guiding_question"] == "¿Dónde viven los animales?"
    assert listed.json()[0]["lessons"] == []


@pytest.mark.parametrize(
    "body",
    [{"title": "Sin pregunta"}, {"guiding_question": "¿Sin título?"}, {"title": "  ", "guiding_question": "¿Algo?"},
     {"title": "x" * 121, "guiding_question": "¿Algo?"}, {"title": "A", "guiding_question": "¿B?", "otro": 1}],
)
async def test_titulo_y_pregunta_guia_son_obligatorios(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient, body: dict
) -> None:
    who = teacher(identity_client, classroom_client)

    response = await client.post(f"/classrooms/{who.classroom_id}/units", json=body, headers=auth(who.token))

    assert response.status_code == 422


async def test_solo_el_docente_de_la_clase_crea_unidades(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    owner = teacher(identity_client, classroom_client)
    other = teacher(identity_client, classroom_client)
    _, student_token = student(identity_client, classroom_client, owner.classroom_id)
    body = {"title": "Ajena", "guiding_question": "¿Puedo?"}

    by_other = await client.post(f"/classrooms/{owner.classroom_id}/units", json=body, headers=auth(other.token))
    by_student = await client.post(f"/classrooms/{owner.classroom_id}/units", json=body, headers=auth(student_token))

    assert by_other.status_code == 403
    assert by_student.status_code == 403


async def test_si_classroom_service_no_responde_no_se_crea_la_unidad(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    classroom_client.available = False

    response = await client.post(
        f"/classrooms/{who.classroom_id}/units", json={"title": "A", "guiding_question": "¿B?"}, headers=auth(who.token)
    )

    assert response.status_code == 403


async def test_reordenar_las_unidades(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    a, b, c = [await unit(client, who, name) for name in ("A", "B", "C")]
    url = f"/classrooms/{who.classroom_id}/units/order"

    reordered = await client.put(url, json={"ids": [c["id"], a["id"], b["id"]]}, headers=auth(who.token))
    missing_one = await client.put(url, json={"ids": [c["id"], a["id"]]}, headers=auth(who.token))
    repeated = await client.put(url, json={"ids": [c["id"], c["id"], b["id"]]}, headers=auth(who.token))

    assert [u["title"] for u in reordered.json()] == ["C", "A", "B"]
    assert missing_one.status_code == 422
    assert missing_one.json()["error"]["code"] == "orden_invalido"
    assert repeated.status_code == 422


async def test_una_unidad_con_lecciones_no_se_borra_y_una_vacia_si(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    full = await unit(client, who, "Con lecciones")
    empty = await unit(client, who, "Vacía")
    last = await unit(client, who, "Última")
    await lesson(client, who, full["id"])

    refused = await client.delete(f"/units/{full['id']}", headers=auth(who.token))
    deleted = await client.delete(f"/units/{empty['id']}", headers=auth(who.token))
    listed = (await client.get(f"/classrooms/{who.classroom_id}/units", headers=auth(who.token))).json()

    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "unidad_con_lecciones"
    assert deleted.status_code == 204
    # The one after it moved up, the order has no gaps.
    assert [(u["title"], u["order_index"]) for u in listed] == [("Con lecciones", 0), ("Última", 1)]
    assert last["order_index"] == 2


async def test_editar_una_unidad_y_no_dejar_campos_vacios(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    created = await unit(client, who)
    other = teacher(identity_client, classroom_client)

    renamed = await client.patch(f"/units/{created['id']}", json={"title": "Animales"}, headers=auth(who.token))
    emptied = await client.patch(f"/units/{created['id']}", json={"guiding_question": None}, headers=auth(who.token))
    by_other = await client.patch(f"/units/{created['id']}", json={"title": "Mía"}, headers=auth(other.token))

    assert renamed.json()["title"] == "Animales"
    assert renamed.json()["guiding_question"] == "¿Dónde viven los animales?"
    assert emptied.status_code == 422
    assert by_other.status_code == 403


async def test_el_peque_solo_ve_unidades_con_lecciones_publicadas(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    with_published = await unit(client, who, "Con publicada")
    only_drafts = await unit(client, who, "Solo borradores")
    published = await published_lesson(client, who, with_published["id"])
    await lesson(client, who, with_published["id"], "Borrador")
    await lesson(client, who, only_drafts["id"], "Otro borrador")
    _, kid = student(identity_client, classroom_client, who.classroom_id)

    for_kid = (await client.get(f"/classrooms/{who.classroom_id}/units", headers=auth(kid))).json()
    for_teacher = (await client.get(f"/classrooms/{who.classroom_id}/units", headers=auth(who.token))).json()

    assert [u["title"] for u in for_kid] == ["Con publicada"]
    assert [lesson["id"] for lesson in for_kid[0]["lessons"]] == [published["id"]]
    assert [len(u["lessons"]) for u in for_teacher] == [2, 1]


async def test_un_peque_de_otra_clase_no_ve_las_unidades(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    _, outsider = student(identity_client, classroom_client, uuid4())

    response = await client.get(f"/classrooms/{who.classroom_id}/units", headers=auth(outsider))

    assert response.status_code == 403
