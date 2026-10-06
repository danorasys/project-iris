# Extras of a lesson (HU-82): more content or one more activity, for every
# kid of the class or only for some; optional, and hidden from the kids
# until complete.

from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient

from tests.fakes import FakeClassroomClient, FakeIdentityClient, FakeObjectStorage
from tests.helpers import COMPLETE_ACTIVITY, COMPLETE_PAGES, auth, page, published_lesson, student, teacher

pytestmark = pytest.mark.asyncio


async def test_un_extra_de_contenido_para_algunos_peques(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    published = await published_lesson(client, who)
    kid_id, _ = student(identity_client, classroom_client, who.classroom_id)
    url = f"/lessons/{published['id']}/extras"

    created = await client.post(
        url,
        json={"kind": "contenido", "title": "Más animales", "for_everyone": False, "student_ids": [str(kid_id)]},
        headers=auth(who.token),
    )
    extra_id = created.json()["id"]
    filled = await client.patch(f"{url}/{extra_id}", json={"blocks": COMPLETE_PAGES}, headers=auth(who.token))

    assert created.status_code == 201, created.text
    assert created.json()["student_ids"] == [str(kid_id)]
    # Empty, it says what's missing; the lesson stays published anyway.
    assert created.json()["missing"]
    assert filled.json()["missing"] == []
    assert len(filled.json()["blocks"]) == 2
    lesson = (await client.get(f"/lessons/{published['id']}", headers=auth(who.token))).json()
    assert lesson["status"] == "publicada"
    assert [extra["title"] for extra in lesson["extras"]] == ["Más animales"]


async def test_un_extra_de_actividad_tiene_sus_preguntas(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    published = await published_lesson(client, who)
    url = f"/lessons/{published['id']}/extras"
    created = (await client.post(url, json={"kind": "actividad", "title": "Reto"}, headers=auth(who.token))).json()

    with_questions = await client.put(f"{url}/{created['id']}/activity", json=COMPLETE_ACTIVITY, headers=auth(who.token))
    with_pages = await client.patch(f"{url}/{created['id']}", json={"blocks": COMPLETE_PAGES}, headers=auth(who.token))

    assert with_questions.status_code == 200
    assert with_questions.json()["missing"] == []
    assert len(with_questions.json()["activity"]["questions"]) == 1
    # An activity extra has no pages.
    assert with_pages.status_code == 422


async def test_un_extra_solo_es_para_peques_de_la_clase(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    published = await published_lesson(client, who)
    outsider_id, _ = student(identity_client, classroom_client, uuid4())
    url = f"/lessons/{published['id']}/extras"

    refused = await client.post(
        url,
        json={"kind": "contenido", "title": "X", "for_everyone": False, "student_ids": [str(outsider_id)]},
        headers=auth(who.token),
    )
    nobody = await client.post(url, json={"kind": "contenido", "title": "X", "for_everyone": False}, headers=auth(who.token))

    assert refused.status_code == 422
    assert refused.json()["error"]["code"] == "estudiantes_no_validos"
    # Saved, but it asks who it's for before the kids can see it.
    assert any("estudiantes" in item for item in nobody.json()["missing"])


async def test_volver_a_para_todos_olvida_la_lista(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    published = await published_lesson(client, who)
    kid_id, _ = student(identity_client, classroom_client, who.classroom_id)
    url = f"/lessons/{published['id']}/extras"
    created = (
        await client.post(
            url,
            json={"kind": "contenido", "title": "X", "for_everyone": False, "student_ids": [str(kid_id)]},
            headers=auth(who.token),
        )
    ).json()

    for_all = await client.patch(f"{url}/{created['id']}", json={"for_everyone": True}, headers=auth(who.token))

    assert (for_all.json()["for_everyone"], for_all.json()["student_ids"]) == (True, [])


async def test_borrar_un_extra_reordena_los_demas_y_borra_sus_imagenes(
    client: AsyncClient,
    identity_client: FakeIdentityClient,
    classroom_client: FakeClassroomClient,
    object_storage: FakeObjectStorage,
) -> None:
    who = teacher(identity_client, classroom_client)
    published = await published_lesson(client, who)
    url = f"/lessons/{published['id']}/extras"
    first = (await client.post(url, json={"kind": "contenido", "title": "Uno"}, headers=auth(who.token))).json()
    await client.post(url, json={"kind": "actividad", "title": "Dos"}, headers=auth(who.token))
    upload = await client.post(
        f"/lessons/{published['id']}/images",
        files={"file": ("a.png", b"\x89PNG\r\n\x1a\n" + b"x", "image/png")},
        headers=auth(who.token),
    )
    image_file = upload.json()["image_file"]
    await client.patch(
        f"{url}/{first['id']}",
        json={"blocks": page({"type": "imagen", "image_file": image_file, "alt_text": "Un pez"})},
        headers=auth(who.token),
    )

    deleted = await client.delete(f"{url}/{first['id']}", headers=auth(who.token))
    extras = (await client.get(f"/lessons/{published['id']}", headers=auth(who.token))).json()["extras"]

    assert deleted.status_code == 204
    assert [(e["title"], e["order_index"]) for e in extras] == [("Dos", 0)]
    assert not [key for key in object_storage.files if key.endswith(image_file)]


async def test_el_peque_no_recibe_los_extras_en_el_detalle(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    published = await published_lesson(client, who)
    _, kid = student(identity_client, classroom_client, who.classroom_id)
    await client.post(f"/lessons/{published['id']}/extras", json={"kind": "contenido", "title": "X"}, headers=auth(who.token))

    seen = (await client.get(f"/lessons/{published['id']}", headers=auth(kid))).json()

    assert seen["extras"] == []


async def test_solo_el_docente_de_la_leccion_maneja_sus_extras(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    published = await published_lesson(client, who)
    other = teacher(identity_client, classroom_client)
    url = f"/lessons/{published['id']}/extras"
    created = (await client.post(url, json={"kind": "contenido", "title": "X"}, headers=auth(who.token))).json()

    add = await client.post(url, json={"kind": "contenido", "title": "Mío"}, headers=auth(other.token))
    edit = await client.patch(f"{url}/{created['id']}", json={"title": "Mío"}, headers=auth(other.token))
    remove = await client.delete(f"{url}/{created['id']}", headers=auth(other.token))
    unknown = await client.delete(f"{url}/{uuid4()}", headers=auth(who.token))

    assert (add.status_code, edit.status_code, remove.status_code) == (403, 403, 403)
    assert unknown.status_code == 404
