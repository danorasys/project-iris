# Lessons (HU-78 to HU-81, HU-84, HU-102, HU-103): created inside a unit,
# their pages of blocks, their activity, publishing only when complete,
# their images and who can see what.

from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient

from tests.fakes import FakeClassroomClient, FakeIdentityClient, FakeObjectStorage
from tests.helpers import (
    COMPLETE_ACTIVITY,
    COMPLETE_PAGES,
    JPEG,
    PNG,
    Teacher,
    auth,
    lesson,
    page,
    published_lesson,
    student,
    teacher,
    unit,
)

pytestmark = pytest.mark.asyncio


async def _upload(client: AsyncClient, who: Teacher, lesson_id: str, content: bytes = PNG, kind: str = "image/png") -> str:
    response = await client.post(
        f"/lessons/{lesson_id}/images", files={"file": ("figura", content, kind)}, headers=auth(who.token)
    )
    assert response.status_code == 201, response.text
    image_file: str = response.json()["image_file"]
    return image_file


# --- creating a lesson ------------------------------------------------------------


async def test_la_leccion_nace_en_su_unidad_como_borrador_con_proposito_y_desempeno(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    created_unit = await unit(client, who)

    first = await lesson(client, who, created_unit["id"], "Primera")
    second = await lesson(client, who, created_unit["id"], "Segunda")

    assert first["status"] == "borrador"
    assert first["unit_id"] == created_unit["id"]
    assert first["classroom_id"] == str(who.classroom_id)
    assert first["purpose"].startswith("Hoy vas a aprender")
    assert first["learning_goal"] == "Identifico dónde viven algunos animales."
    assert (first["order_index"], second["order_index"]) == (0, 1)
    # Nothing to read yet, so it says what's missing to publish it.
    assert any("Contenido" in item for item in first["missing"])
    assert any("Actividad" in item for item in first["missing"])


@pytest.mark.parametrize("missing", ["title", "purpose", "learning_goal"])
async def test_titulo_proposito_y_desempeno_son_obligatorios(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient, missing: str
) -> None:
    who = teacher(identity_client, classroom_client)
    created_unit = await unit(client, who)
    body = {"title": "T", "purpose": "P", "learning_goal": "D"}
    del body[missing]

    response = await client.post(f"/units/{created_unit['id']}/lessons", json=body, headers=auth(who.token))

    assert response.status_code == 422


async def test_solo_el_docente_de_la_unidad_crea_lecciones_en_ella(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    owner = teacher(identity_client, classroom_client)
    other = teacher(identity_client, classroom_client)
    created_unit = await unit(client, owner)
    _, kid = student(identity_client, classroom_client, owner.classroom_id)
    body = {"title": "T", "purpose": "P", "learning_goal": "D"}

    by_other = await client.post(f"/units/{created_unit['id']}/lessons", json=body, headers=auth(other.token))
    by_student = await client.post(f"/units/{created_unit['id']}/lessons", json=body, headers=auth(kid))
    no_unit = await client.post(f"/units/{uuid4()}/lessons", json=body, headers=auth(owner.token))

    assert by_other.status_code == 403
    assert by_student.status_code == 403
    assert no_unit.status_code == 404


# --- pages and blocks -----------------------------------------------------------------


async def test_las_paginas_guardan_cada_tipo_de_bloque(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    created = await lesson(client, who, (await unit(client, who))["id"])
    image_file = await _upload(client, who, created["id"])
    blocks = page(
        {"type": "titulo", "text": "Los animales"},
        {"type": "subtitulo", "text": "De la tierra"},
        {"type": "texto", "text": "Muchos animales viven en la tierra.\nOtros en el agua."},
        {"type": "lista", "items": ["Perro", "Gato"]},
        {"type": "tabla", "rows": [["Animal", "Dónde vive"], ["Pez", "Agua"]]},
    ) + page({"type": "imagen", "image_file": image_file, "alt_text": "Un perro corriendo"}, page_index=1)

    response = await client.patch(f"/lessons/{created['id']}", json={"blocks": blocks}, headers=auth(who.token))
    saved = response.json()["blocks"]

    assert response.status_code == 200, response.text
    assert [b["type"] for b in saved] == ["titulo", "subtitulo", "texto", "lista", "tabla", "imagen"]
    assert saved[3]["items"] == ["Perro", "Gato"]
    assert saved[4]["rows"] == [["Animal", "Dónde vive"], ["Pez", "Agua"]]
    assert (saved[5]["page_index"], saved[5]["alt_text"]) == (1, "Un perro corriendo")


@pytest.mark.parametrize(
    "block",
    [
        {"type": "titulo", "text": "Dos\nlíneas"},
        {"type": "titulo", "text": "x" * 201},
        {"type": "tabla", "rows": [["A", "B"], ["solo una"]]},
        {"type": "tabla", "rows": [["1", "2", "3", "4", "5", "6", "7"]]},
        {"type": "lista", "items": ["x"] * 21},
        {"type": "imagen", "image_file": "https://example.com/gato.png"},
        {"type": "imagen", "image_file": "../otra-leccion/a.png"},
        {"type": "video", "text": "no existe"},
        {"type": "texto", "text": "<b>hola</b>", "html": True},
    ],
)
async def test_bloques_que_no_cumplen_las_reglas_dan_422(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient, block: dict
) -> None:
    who = teacher(identity_client, classroom_client)
    created = await lesson(client, who, (await unit(client, who))["id"])

    response = await client.patch(f"/lessons/{created['id']}", json={"blocks": page(block)}, headers=auth(who.token))

    assert response.status_code == 422


async def test_dos_bloques_no_ocupan_el_mismo_lugar(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    created = await lesson(client, who, (await unit(client, who))["id"])
    clash = [
        {"type": "texto", "text": "A", "page_index": 0, "order_index": 0},
        {"type": "texto", "text": "B", "page_index": 0, "order_index": 0},
    ]

    response = await client.patch(f"/lessons/{created['id']}", json={"blocks": clash}, headers=auth(who.token))

    assert response.status_code == 422


async def test_un_borrador_guarda_trabajo_a_medias(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    created = await lesson(client, who, (await unit(client, who))["id"])
    image_file = await _upload(client, who, created["id"])
    half_done = page({"type": "texto", "text": ""}, {"type": "imagen", "image_file": image_file})

    response = await client.patch(f"/lessons/{created['id']}", json={"blocks": half_done}, headers=auth(who.token))

    assert response.status_code == 200
    assert any("bloques vacíos" in item for item in response.json()["missing"])
    assert any("texto alternativo" in item for item in response.json()["missing"])


# --- activity ---------------------------------------------------------------------------


async def test_la_actividad_guarda_sus_preguntas_con_una_sola_correcta(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    created = await lesson(client, who, (await unit(client, who))["id"])

    saved = await client.put(f"/lessons/{created['id']}/activity", json=COMPLETE_ACTIVITY, headers=auth(who.token))
    replaced = await client.put(
        f"/lessons/{created['id']}/activity",
        json={**COMPLETE_ACTIVITY, "questions": COMPLETE_ACTIVITY["questions"] * 2, "pass_threshold": 2},
        headers=auth(who.token),
    )

    assert saved.status_code == 200, saved.text
    assert saved.json()["activity"]["questions"][0]["options"][0]["is_correct"] is True
    assert len(replaced.json()["activity"]["questions"]) == 2
    assert replaced.json()["activity"]["pass_threshold"] == 2


@pytest.mark.parametrize(
    "options",
    [
        [{"text": "A", "is_correct": True}],
        [{"text": "A", "is_correct": True}, {"text": "B", "is_correct": True}],
        [{"text": str(n), "is_correct": n == 0} for n in range(5)],
    ],
)
async def test_preguntas_con_opciones_no_validas_dan_422(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient, options: list
) -> None:
    who = teacher(identity_client, classroom_client)
    created = await lesson(client, who, (await unit(client, who))["id"])
    body = {"pass_threshold": 1, "questions": [{"prompt": "¿?", "options": options}]}

    response = await client.put(f"/lessons/{created['id']}/activity", json=body, headers=auth(who.token))

    assert response.status_code == 422


# --- publishing -------------------------------------------------------------------------


async def test_publicar_exige_todo_y_dice_que_falta(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    created = await lesson(client, who, (await unit(client, who))["id"])
    url = f"/lessons/{created['id']}"

    empty = await client.post(f"{url}/publish", headers=auth(who.token))
    await client.patch(url, json={"blocks": COMPLETE_PAGES}, headers=auth(who.token))
    no_right_answer = {
        "pass_threshold": 2,
        "questions": [{"prompt": "¿Dónde?", "options": [{"text": "Aquí"}, {"text": "Allá"}]}],
    }
    await client.put(f"{url}/activity", json=no_right_answer, headers=auth(who.token))
    half = await client.post(f"{url}/publish", headers=auth(who.token))
    await client.put(f"{url}/activity", json=COMPLETE_ACTIVITY, headers=auth(who.token))
    done = await client.post(f"{url}/publish", headers=auth(who.token))

    assert empty.status_code == 422
    assert empty.json()["error"]["code"] == "leccion_incompleta"
    assert len(empty.json()["error"]["details"]["missing"]) == 2
    missing = half.json()["error"]["details"]["missing"]
    assert any("opción correcta" in item for item in missing)
    assert any("mínimo para aprobar" in item for item in missing)
    assert done.status_code == 200
    assert done.json()["status"] == "publicada"
    assert done.json()["missing"] == []


async def test_una_leccion_publicada_solo_se_guarda_completa(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    published = await published_lesson(client, who)
    url = f"/lessons/{published['id']}"

    emptied = await client.patch(url, json={"blocks": []}, headers=auth(who.token))
    no_questions = await client.put(f"{url}/activity", json={"pass_threshold": 1, "questions": []}, headers=auth(who.token))
    edited = await client.patch(url, json={"title": "Animales de la tierra"}, headers=auth(who.token))

    assert emptied.status_code == 422
    assert emptied.json()["error"]["code"] == "leccion_incompleta"
    assert no_questions.status_code == 422
    assert edited.status_code == 200
    assert (edited.json()["title"], edited.json()["status"]) == ("Animales de la tierra", "publicada")
    # What was refused didn't touch it.
    assert len(edited.json()["blocks"]) == 2


# --- moving, ordering and deleting -------------------------------------------------------


async def test_mover_una_leccion_a_otra_unidad_la_deja_al_final(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    origin = await unit(client, who, "Origen")
    target = await unit(client, who, "Destino")
    await lesson(client, who, target["id"], "Ya estaba")
    moving = await lesson(client, who, origin["id"], "Se mueve")
    foreign = teacher(identity_client, classroom_client)
    foreign_unit = await unit(client, foreign)

    moved = await client.patch(f"/lessons/{moving['id']}", json={"unit_id": target["id"]}, headers=auth(who.token))
    to_foreign = await client.patch(f"/lessons/{moving['id']}", json={"unit_id": foreign_unit["id"]}, headers=auth(who.token))
    no_unit = await client.patch(f"/lessons/{moving['id']}", json={"unit_id": None}, headers=auth(who.token))

    assert (moved.json()["unit_id"], moved.json()["order_index"]) == (target["id"], 1)
    assert to_foreign.status_code == 403
    assert no_unit.status_code == 422


async def test_reordenar_las_lecciones_de_una_unidad(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    created_unit = await unit(client, who)
    a, b = [await lesson(client, who, created_unit["id"], name) for name in ("A", "B")]
    url = f"/units/{created_unit['id']}/lessons/order"

    reordered = await client.put(url, json={"ids": [b["id"], a["id"]]}, headers=auth(who.token))
    incomplete = await client.put(url, json={"ids": [b["id"]]}, headers=auth(who.token))

    assert [lesson["title"] for lesson in reordered.json()] == ["B", "A"]
    assert incomplete.status_code == 422


async def test_eliminar_una_leccion_borra_todo_lo_suyo(
    client: AsyncClient,
    identity_client: FakeIdentityClient,
    classroom_client: FakeClassroomClient,
    object_storage: FakeObjectStorage,
) -> None:
    who = teacher(identity_client, classroom_client)
    published = await published_lesson(client, who)
    await _upload(client, who, published["id"])
    other = teacher(identity_client, classroom_client)

    by_other = await client.delete(f"/lessons/{published['id']}", headers=auth(other.token))
    deleted = await client.delete(f"/lessons/{published['id']}", headers=auth(who.token))
    after = await client.get(f"/lessons/{published['id']}", headers=auth(who.token))

    assert by_other.status_code == 403
    assert deleted.status_code == 204
    assert after.status_code == 404
    assert not [key for key in object_storage.files if published["id"] in key]


# --- who sees what ------------------------------------------------------------------------


async def test_el_peque_ve_la_leccion_publicada_sin_la_actividad(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    published = await published_lesson(client, who)
    draft = await lesson(client, who, published["unit_id"], "Borrador")
    _, kid = student(identity_client, classroom_client, who.classroom_id)

    seen = await client.get(f"/lessons/{published['id']}", headers=auth(kid))
    hidden = await client.get(f"/lessons/{draft['id']}", headers=auth(kid))

    assert seen.status_code == 200
    assert len(seen.json()["blocks"]) == 2
    # The right answers never reach a kid.
    assert seen.json()["activity"] is None
    assert seen.json()["missing"] == []
    assert hidden.status_code == 404


async def test_otro_docente_no_ve_ni_edita_la_leccion(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    created = await lesson(client, who, (await unit(client, who))["id"])
    other = teacher(identity_client, classroom_client)

    read = await client.get(f"/lessons/{created['id']}", headers=auth(other.token))
    edit = await client.patch(f"/lessons/{created['id']}", json={"title": "Mía"}, headers=auth(other.token))
    publish = await client.post(f"/lessons/{created['id']}/publish", headers=auth(other.token))

    assert (read.status_code, edit.status_code, publish.status_code) == (403, 403, 403)


async def test_la_lista_plana_de_lecciones_sigue_igual_para_el_peque(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    published = await published_lesson(client, who)
    await lesson(client, who, published["unit_id"], "Borrador")
    _, kid = student(identity_client, classroom_client, who.classroom_id)
    _, outsider = student(identity_client, classroom_client, uuid4())

    for_teacher = await client.get(f"/classrooms/{who.classroom_id}/lessons", headers=auth(who.token))
    for_kid = await client.get(f"/classrooms/{who.classroom_id}/lessons", headers=auth(kid))
    for_outsider = await client.get(f"/classrooms/{who.classroom_id}/lessons", headers=auth(outsider))

    assert len(for_teacher.json()) == 2
    assert [lesson["id"] for lesson in for_kid.json()] == [published["id"]]
    assert for_outsider.status_code == 403


async def test_servicios_caidos_o_sin_sesion(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    without_token = await client.get(f"/classrooms/{who.classroom_id}/units")
    identity_client.available = False
    identity_down = await client.get(f"/classrooms/{who.classroom_id}/units", headers=auth(who.token))

    assert without_token.status_code == 401
    assert identity_down.status_code == 503


async def test_un_docente_sin_el_codigo_2fa_no_entra(client: AsyncClient, identity_client: FakeIdentityClient) -> None:
    identity_client.register("token-docente", uuid4(), "teacher", mfa_verified=False)

    response = await client.get(f"/classrooms/{uuid4()}/units", headers=auth("token-docente"))

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "verificacion_2fa_requerida"


# What the page asks by itself doesn't keep a teacher's panel open.
async def test_lo_que_la_pagina_pide_sola_no_cuenta_como_actividad(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    url = f"/classrooms/{who.classroom_id}/units"

    await client.get(url, headers=auth(who.token))
    await client.get(url, headers={**auth(who.token), "X-Iris-Activity": "background"})

    assert identity_client.renews == [True, False]


async def test_health_live_and_ready(client: AsyncClient) -> None:
    assert (await client.get("/health/live")).status_code == 200
    assert (await client.get("/health/ready")).status_code == 200


# --- images -------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("content", "kind"),
    [(PNG, "text/plain"), (b"<svg xmlns='http://www.w3.org/2000/svg'></svg>", "image/svg+xml"), (b"no es imagen", "image/png")],
)
async def test_solo_se_suben_imagenes_reales(
    client: AsyncClient,
    identity_client: FakeIdentityClient,
    classroom_client: FakeClassroomClient,
    content: bytes,
    kind: str,
) -> None:
    who = teacher(identity_client, classroom_client)
    created = await lesson(client, who, (await unit(client, who))["id"])

    response = await client.post(
        f"/lessons/{created['id']}/images", files={"file": ("x", content, kind)}, headers=auth(who.token)
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "archivo_invalido"


async def test_una_imagen_muy_grande_se_rechaza(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    created = await lesson(client, who, (await unit(client, who))["id"])
    large = PNG + b"0" * (5 * 1024 * 1024)

    response = await client.post(
        f"/lessons/{created['id']}/images", files={"file": ("x.png", large, "image/png")}, headers=auth(who.token)
    )

    assert response.status_code == 422


async def test_la_extension_sale_del_tipo_y_no_del_nombre(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    created = await lesson(client, who, (await unit(client, who))["id"])

    image_file = await _upload(client, who, created["id"], JPEG, "image/jpeg")

    assert image_file.endswith(".jpg")
    assert "/" not in image_file


async def test_almacenamiento_lleno_responde_507(
    client: AsyncClient,
    identity_client: FakeIdentityClient,
    classroom_client: FakeClassroomClient,
    object_storage: FakeObjectStorage,
) -> None:
    who = teacher(identity_client, classroom_client)
    created = await lesson(client, who, (await unit(client, who))["id"])
    object_storage.full = True

    response = await client.post(
        f"/lessons/{created['id']}/images", files={"file": ("x.png", PNG, "image/png")}, headers=auth(who.token)
    )

    assert response.status_code == 507


async def test_las_imagenes_que_la_leccion_deja_de_mostrar_se_borran(
    client: AsyncClient,
    identity_client: FakeIdentityClient,
    classroom_client: FakeClassroomClient,
    object_storage: FakeObjectStorage,
) -> None:
    who = teacher(identity_client, classroom_client)
    created = await lesson(client, who, (await unit(client, who))["id"])
    image_file = await _upload(client, who, created["id"])
    with_image = page({"type": "imagen", "image_file": image_file, "alt_text": "Un gato"})
    await client.patch(f"/lessons/{created['id']}", json={"blocks": with_image}, headers=auth(who.token))

    await client.patch(f"/lessons/{created['id']}", json={"blocks": COMPLETE_PAGES}, headers=auth(who.token))

    assert not [key for key in object_storage.files if key.endswith(image_file)]


async def _published_with_image(
    client: AsyncClient, identity: FakeIdentityClient, classrooms: FakeClassroomClient
) -> tuple[Teacher, dict[str, Any], str, str]:
    who = teacher(identity, classrooms)
    published = await published_lesson(client, who)
    image_file = await _upload(client, who, published["id"])
    unused = await _upload(client, who, published["id"])
    blocks = COMPLETE_PAGES + page({"type": "imagen", "image_file": image_file, "alt_text": "Un perro"}, page_index=1)
    response = await client.patch(f"/lessons/{published['id']}", json={"blocks": blocks}, headers=auth(who.token))
    assert response.status_code == 200, response.text
    return who, published, image_file, unused


async def test_quien_puede_descargar_las_imagenes_de_una_leccion(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who, published, image_file, unused = await _published_with_image(client, identity_client, classroom_client)
    _, kid = student(identity_client, classroom_client, who.classroom_id)
    _, outsider = student(identity_client, classroom_client, uuid4())
    other = teacher(identity_client, classroom_client)
    url = f"/lessons/{published['id']}/images"

    assert (await client.get(f"{url}/{image_file}", headers=auth(who.token))).status_code == 200
    assert (await client.get(f"{url}/{image_file}", headers=auth(kid))).status_code == 200
    # Not a member, another teacher, an upload the lesson doesn't show or no
    # session: the same 404 or 401, nothing tells what exists.
    assert (await client.get(f"{url}/{image_file}", headers=auth(outsider))).status_code == 404
    assert (await client.get(f"{url}/{image_file}", headers=auth(other.token))).status_code == 404
    assert (await client.get(f"{url}/{unused}", headers=auth(kid))).status_code == 404
    assert (await client.get(f"{url}/{image_file}")).status_code == 401
