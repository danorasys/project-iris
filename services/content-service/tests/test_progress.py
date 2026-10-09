# A kid playing a lesson (HU-46, HU-47): what they get to play, the pages
# they reach, their tries graded by the server, and the progress the
# parents' portal reads through classroom-service.

from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.config import get_settings
from tests.fakes import FakeClassroomClient, FakeIdentityClient
from tests.helpers import COMPLETE_PAGES, Teacher, auth, lesson, page, published_lesson, student, teacher, unit

pytestmark = pytest.mark.asyncio

# Two questions, one right answer needed to pass.
TWO_QUESTIONS = {
    "pass_threshold": 1,
    "questions": [
        {
            "prompt": "¿Dónde vive el perro?",
            "options": [{"text": "En la tierra", "is_correct": True}, {"text": "En el mar", "is_correct": False}],
        },
        {
            "prompt": "¿Dónde vive el pez?",
            "options": [{"text": "En la tierra", "is_correct": False}, {"text": "En el agua", "is_correct": True}],
        },
    ],
}

TWO_PAGES = COMPLETE_PAGES + page({"type": "texto", "text": "El gato también."}, page_index=3)


def _internal() -> dict[str, str]:
    return {"X-Internal-Key": get_settings().internal_service_key}


async def _lesson(client: AsyncClient, who: Teacher, unit_id: str | None = None, title: str = "Animales") -> dict[str, Any]:
    unit_id = unit_id or (await unit(client, who))["id"]
    created = await lesson(client, who, unit_id, title)
    await client.patch(f"/lessons/{created['id']}", json={"blocks": TWO_PAGES}, headers=auth(who.token))
    await client.put(f"/lessons/{created['id']}/activity", json=TWO_QUESTIONS, headers=auth(who.token))
    response = await client.post(f"/lessons/{created['id']}/publish", headers=auth(who.token))
    assert response.status_code == 200, response.text
    result: dict[str, Any] = response.json()
    return result


async def _extra(client: AsyncClient, who: Teacher, lesson_id: str, kind: str, **audience: Any) -> str:
    url = f"/lessons/{lesson_id}/extras"
    created = await client.post(url, json={"kind": kind, "title": f"Extra {kind}", **audience}, headers=auth(who.token))
    assert created.status_code == 201, created.text
    extra_id: str = created.json()["id"]
    if kind == "contenido":
        await client.patch(f"{url}/{extra_id}", json={"blocks": COMPLETE_PAGES}, headers=auth(who.token))
    else:
        await client.put(f"{url}/{extra_id}/activity", json=TWO_QUESTIONS, headers=auth(who.token))
    return extra_id


RIGHT_ANSWER = {"¿Dónde vive el perro?": "En la tierra", "¿Dónde vive el pez?": "En el agua"}


# The answers a kid picks: the right one or a wrong one of each question.
def _answers(activity: dict[str, Any], right: list[bool]) -> list[dict[str, str]]:
    picks = []
    for question, wants_right in zip(activity["questions"], right):
        good = next(o for o in question["options"] if o["text"] == RIGHT_ANSWER[question["prompt"]])
        bad = next(o for o in question["options"] if o["id"] != good["id"])
        picks.append({"question_id": question["id"], "option_id": (good if wants_right else bad)["id"]})
    return picks


# ---------------------------------------------------------------------------
# Playing
# ---------------------------------------------------------------------------


async def test_el_peque_juega_la_leccion_sin_ver_las_respuestas(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    played = await _lesson(client, who)
    _kid, kid_token = student(identity_client, classroom_client, who.classroom_id)

    response = await client.get(f"/lessons/{played['id']}/play", headers=auth(kid_token))

    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["blocks"]) == 3 and body["pages_seen"] == 0
    assert [q["prompt"] for q in body["activity"]["questions"]] == ["¿Dónde vive el perro?", "¿Dónde vive el pez?"]
    assert all(set(o) == {"id", "text"} for q in body["activity"]["questions"] for o in q["options"])
    assert "is_correct" not in response.text


async def test_solo_ve_los_extras_completos_que_son_para_el(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    played = await _lesson(client, who)
    kid, kid_token = student(identity_client, classroom_client, who.classroom_id)
    other, _ = student(identity_client, classroom_client, who.classroom_id)
    for_all = await _extra(client, who, played["id"], "contenido")
    for_kid = await _extra(client, who, played["id"], "actividad", for_everyone=False, student_ids=[str(kid)])
    await _extra(client, who, played["id"], "contenido", for_everyone=False, student_ids=[str(other)])
    # An empty one isn't shown to anybody.
    await client.post(f"/lessons/{played['id']}/extras", json={"kind": "contenido", "title": "Vacío"}, headers=auth(who.token))

    body = (await client.get(f"/lessons/{played['id']}/play", headers=auth(kid_token))).json()

    assert [e["id"] for e in body["extras"]] == [for_all, for_kid]
    assert body["extras"][1]["activity"]["questions"][0]["options"][0].keys() == {"id", "text"}


@pytest.mark.parametrize("who_asks", ["outsider", "teacher", "draft"])
async def test_no_se_juega_lo_que_no_es_para_uno(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient, who_asks: str
) -> None:
    who = teacher(identity_client, classroom_client)
    played = await _lesson(client, who)
    lesson_id = played["id"]
    if who_asks == "outsider":
        _kid, token = student(identity_client, classroom_client, uuid4())
    elif who_asks == "teacher":
        token = who.token
    else:
        _kid, token = student(identity_client, classroom_client, who.classroom_id)
        lesson_id = (await lesson(client, who, played["unit_id"], "Borrador"))["id"]

    response = await client.get(f"/lessons/{lesson_id}/play", headers=auth(token))

    assert response.status_code == (403 if who_asks == "teacher" else 404)


# ---------------------------------------------------------------------------
# Pages reached
# ---------------------------------------------------------------------------


async def test_el_avance_no_baja_y_el_peque_vuelve_a_donde_quedo(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    played = await _lesson(client, who)
    _kid, kid_token = student(identity_client, classroom_client, who.classroom_id)
    url = f"/lessons/{played['id']}/progress"

    first = await client.put(url, json={"page": 1}, headers=auth(kid_token))
    past_the_end = await client.put(url, json={"page": 9}, headers=auth(kid_token))
    back = await client.put(url, json={"page": 1}, headers=auth(kid_token))
    replayed = (await client.get(f"/lessons/{played['id']}/play", headers=auth(kid_token))).json()

    assert first.json() == {"extra_id": None, "pages_seen": 1, "last_page": 1}
    assert past_the_end.json() == {"extra_id": None, "pages_seen": 2, "last_page": 2}
    # Going back to read again: the progress stays, the place to come back to moves.
    assert back.json() == {"extra_id": None, "pages_seen": 2, "last_page": 1}
    assert (replayed["pages_seen"], replayed["last_page"]) == (2, 1)


async def test_las_paginas_de_un_extra_van_aparte(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    played = await _lesson(client, who)
    kid, kid_token = student(identity_client, classroom_client, who.classroom_id)
    other, _ = student(identity_client, classroom_client, who.classroom_id)
    extra = await _extra(client, who, played["id"], "contenido")
    not_for_kid = await _extra(client, who, played["id"], "contenido", for_everyone=False, student_ids=[str(other)])
    url = f"/lessons/{played['id']}/progress"

    saved = await client.put(url, json={"page": 1, "extra_id": extra}, headers=auth(kid_token))
    refused = await client.put(url, json={"page": 1, "extra_id": not_for_kid}, headers=auth(kid_token))
    body = (await client.get(f"/lessons/{played['id']}/play", headers=auth(kid_token))).json()

    assert saved.json() == {"extra_id": extra, "pages_seen": 1, "last_page": 1}
    assert refused.status_code == 404
    assert body["pages_seen"] == 0 and body["extras"][0]["pages_seen"] == 1


# ---------------------------------------------------------------------------
# Tries at an activity
# ---------------------------------------------------------------------------


async def test_el_servidor_califica_cada_intento(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    played = await _lesson(client, who)
    _kid, kid_token = student(identity_client, classroom_client, who.classroom_id)
    activity = (await client.get(f"/lessons/{played['id']}/play", headers=auth(kid_token))).json()["activity"]
    url = f"/lessons/{played['id']}/attempts"

    none_right = await client.post(url, json={"answers": _answers(activity, [False, False])}, headers=auth(kid_token))
    one_right = await client.post(url, json={"answers": _answers(activity, [False, True])}, headers=auth(kid_token))

    assert none_right.status_code == 201, none_right.text
    assert (none_right.json()["correct"], none_right.json()["total"], none_right.json()["passed"]) == (0, 2, False)
    assert one_right.json()["results"] == [False, True]
    assert one_right.json()["passed"] is True


async def test_respuestas_que_no_son_de_la_actividad(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    played = await _lesson(client, who)
    _kid, kid_token = student(identity_client, classroom_client, who.classroom_id)
    activity = (await client.get(f"/lessons/{played['id']}/play", headers=auth(kid_token))).json()["activity"]
    answers = _answers(activity, [True, True])
    url = f"/lessons/{played['id']}/attempts"

    skipped = await client.post(url, json={"answers": answers[:1]}, headers=auth(kid_token))
    foreign_option = await client.post(
        url, json={"answers": [answers[0], {**answers[1], "option_id": answers[0]["option_id"]}]}, headers=auth(kid_token)
    )
    repeated = await client.post(url, json={"answers": [answers[0], answers[0]]}, headers=auth(kid_token))
    # The teacher saves the activity again: its questions get new ids.
    await client.put(f"/lessons/{played['id']}/activity", json=TWO_QUESTIONS, headers=auth(who.token))
    stale = await client.post(url, json={"answers": answers}, headers=auth(kid_token))

    assert skipped.status_code == 409 and skipped.json()["error"]["code"] == "actividad_cambio"
    assert foreign_option.status_code == 409
    assert repeated.status_code == 422
    assert stale.status_code == 409


async def test_la_actividad_de_un_extra_y_un_extra_sin_actividad(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    played = await _lesson(client, who)
    _kid, kid_token = student(identity_client, classroom_client, who.classroom_id)
    challenge = await _extra(client, who, played["id"], "actividad")
    reading = await _extra(client, who, played["id"], "contenido")
    extras = (await client.get(f"/lessons/{played['id']}/play", headers=auth(kid_token))).json()["extras"]
    url = f"/lessons/{played['id']}/attempts"

    tried = await client.post(
        url, json={"extra_id": challenge, "answers": _answers(extras[0]["activity"], [True, True])}, headers=auth(kid_token)
    )
    nothing_to_try = await client.post(
        url,
        json={"extra_id": reading, "answers": [{"question_id": str(uuid4()), "option_id": str(uuid4())}]},
        headers=auth(kid_token),
    )

    assert tried.status_code == 201 and tried.json()["correct"] == 2
    assert nothing_to_try.status_code == 404


# ---------------------------------------------------------------------------
# The progress classroom-service reads for the parents' portal
# ---------------------------------------------------------------------------


async def test_el_progreso_de_un_peque_en_su_clase(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    first_unit = (await unit(client, who, "Los animales"))["id"]
    second_unit = (await unit(client, who, "Las plantas"))["id"]
    plants = await _lesson(client, who, second_unit, "Las flores")
    animals = await _lesson(client, who, first_unit, "Animales terrestres")
    await lesson(client, who, first_unit, "Todavía en borrador")
    kid, kid_token = student(identity_client, classroom_client, who.classroom_id)
    other, other_token = student(identity_client, classroom_client, who.classroom_id)
    extra = await _extra(client, who, animals["id"], "actividad")

    # Sofía reads one of two pages and tries the activity twice; the extra once.
    await client.put(f"/lessons/{animals['id']}/progress", json={"page": 1}, headers=auth(kid_token))
    play = (await client.get(f"/lessons/{animals['id']}/play", headers=auth(kid_token))).json()
    attempts = f"/lessons/{animals['id']}/attempts"
    await client.post(attempts, json={"answers": _answers(play["activity"], [False, False])}, headers=auth(kid_token))
    await client.post(attempts, json={"answers": _answers(play["activity"], [True, True])}, headers=auth(kid_token))
    await client.post(
        attempts,
        json={"extra_id": extra, "answers": _answers(play["extras"][0]["activity"], [True, False])},
        headers=auth(kid_token),
    )
    # Another kid's tries never show up in hers.
    await client.put(f"/lessons/{plants['id']}/progress", json={"page": 2}, headers=auth(other_token))

    response = await client.get(f"/internal/classrooms/{who.classroom_id}/students/{kid}/progress", headers=_internal())

    assert response.status_code == 200, response.text
    lessons = response.json()
    # By unit and then by lesson; the draft isn't there.
    assert [(item["unit_title"], item["title"]) for item in lessons] == [
        ("Los animales", "Animales terrestres"),
        ("Las plantas", "Las flores"),
    ]
    animals_progress, plants_progress = lessons
    main = animals_progress["main"]
    # 1 of 2 pages + the activity tried = 2 of 3 steps.
    assert (main["pages_seen"], main["total_pages"], main["percent"]) == (1, 2, 67)
    assert [(a["correct"], a["total"], a["passed"]) for a in main["attempts"]] == [(0, 2, False), (2, 2, True)]
    [extra_progress] = animals_progress["extras"]
    assert (extra_progress["kind"], extra_progress["percent"], len(extra_progress["attempts"])) == ("actividad", 100, 1)
    assert (plants_progress["main"]["pages_seen"], plants_progress["main"]["percent"]) == (0, 0)
    assert main["extra_id"] is None and main["kind"] == "leccion"


async def test_editar_la_actividad_no_borra_los_intentos(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    played = await published_lesson(client, who)
    kid, kid_token = student(identity_client, classroom_client, who.classroom_id)
    question = (await client.get(f"/lessons/{played['id']}/play", headers=auth(kid_token))).json()["activity"]["questions"][0]
    pick = {"question_id": question["id"], "option_id": question["options"][0]["id"]}
    await client.post(f"/lessons/{played['id']}/attempts", json={"answers": [pick]}, headers=auth(kid_token))

    await client.put(f"/lessons/{played['id']}/activity", json=TWO_QUESTIONS, headers=auth(who.token))
    lessons = (
        await client.get(f"/internal/classrooms/{who.classroom_id}/students/{kid}/progress", headers=_internal())
    ).json()

    assert len(lessons[0]["main"]["attempts"]) == 1


async def test_el_progreso_es_solo_para_otros_servicios(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    response = await client.get(f"/internal/classrooms/{uuid4()}/students/{uuid4()}/progress")

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# What the lesson hub needs (HU-61 to HU-64)
# ---------------------------------------------------------------------------


async def test_play_dice_que_actividades_ya_hizo(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    played = await _lesson(client, who)
    extra = await _extra(client, who, played["id"], "actividad")
    _kid, kid_token = student(identity_client, classroom_client, who.classroom_id)
    url = f"/lessons/{played['id']}/play"
    before = (await client.get(url, headers=auth(kid_token))).json()

    await client.post(
        f"/lessons/{played['id']}/attempts",
        json={"answers": _answers(before["activity"], [False, False])},
        headers=auth(kid_token),
    )
    after = (await client.get(url, headers=auth(kid_token))).json()

    assert before["activity_done"] is False and before["last_page"] == 0
    # Done means tried once, whatever the score: the activity is formative.
    assert after["activity_done"] is True
    assert [(e["id"], e["activity_done"]) for e in after["extras"]] == [(extra, False)]


# ---------------------------------------------------------------------------
# Checking one answer while doing the activity (HU-63)
# ---------------------------------------------------------------------------


async def test_revisar_una_respuesta_dice_si_esta_bien_y_no_guarda_nada(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    played = await _lesson(client, who)
    kid, kid_token = student(identity_client, classroom_client, who.classroom_id)
    activity = (await client.get(f"/lessons/{played['id']}/play", headers=auth(kid_token))).json()["activity"]
    [right, wrong] = _answers(activity, [True, False])
    url = f"/lessons/{played['id']}/answer-checks"

    good = await client.post(url, json=right, headers=auth(kid_token))
    bad = await client.post(url, json=wrong, headers=auth(kid_token))
    lessons = (
        await client.get(f"/internal/classrooms/{who.classroom_id}/students/{kid}/progress", headers=_internal())
    ).json()

    assert good.status_code == 200, good.text
    assert good.json() == {"correct": True}
    # Only right or wrong: never which option was the right one.
    assert bad.json() == {"correct": False}
    # Leaving halfway leaves no record: only a whole try counts.
    assert lessons[0]["main"]["attempts"] == []


async def test_revisar_una_respuesta_de_un_extra(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    played = await _lesson(client, who)
    extra = await _extra(client, who, played["id"], "actividad")
    _kid, kid_token = student(identity_client, classroom_client, who.classroom_id)
    body = (await client.get(f"/lessons/{played['id']}/play", headers=auth(kid_token))).json()
    [right, _] = _answers(body["extras"][0]["activity"], [True, True])

    response = await client.post(
        f"/lessons/{played['id']}/answer-checks", json={**right, "extra_id": extra}, headers=auth(kid_token)
    )

    assert response.json() == {"correct": True}


async def test_revisar_una_respuesta_que_ya_no_es_de_la_actividad(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    played = await _lesson(client, who)
    _kid, kid_token = student(identity_client, classroom_client, who.classroom_id)
    activity = (await client.get(f"/lessons/{played['id']}/play", headers=auth(kid_token))).json()["activity"]
    [right, _] = _answers(activity, [True, True])
    url = f"/lessons/{played['id']}/answer-checks"

    unknown_option = await client.post(url, json={**right, "option_id": str(uuid4())}, headers=auth(kid_token))
    # The teacher saves the activity again: every question gets a new id.
    await client.put(f"/lessons/{played['id']}/activity", json=TWO_QUESTIONS, headers=auth(who.token))
    old_question = await client.post(url, json=right, headers=auth(kid_token))

    assert unknown_option.status_code == 409
    assert old_question.status_code == 409
    assert old_question.json()["error"]["code"] == "actividad_cambio"


@pytest.mark.parametrize("who_asks", ["outsider", "teacher"])
async def test_solo_el_peque_de_la_clase_revisa_respuestas(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient, who_asks: str
) -> None:
    who = teacher(identity_client, classroom_client)
    played = await _lesson(client, who)
    _kid, kid_token = student(identity_client, classroom_client, who.classroom_id)
    activity = (await client.get(f"/lessons/{played['id']}/play", headers=auth(kid_token))).json()["activity"]
    [right, _] = _answers(activity, [True, True])
    token = who.token if who_asks == "teacher" else student(identity_client, classroom_client, uuid4())[1]

    response = await client.post(f"/lessons/{played['id']}/answer-checks", json=right, headers=auth(token))

    assert response.status_code == (403 if who_asks == "teacher" else 404)


# ---------------------------------------------------------------------------
# The kid's own progress in a class
# ---------------------------------------------------------------------------


async def test_el_peque_ve_su_propio_progreso(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    played = await _lesson(client, who)
    _kid, kid_token = student(identity_client, classroom_client, who.classroom_id)
    await client.put(f"/lessons/{played['id']}/progress", json={"page": 1}, headers=auth(kid_token))

    response = await client.get(f"/classrooms/{who.classroom_id}/progress", headers=auth(kid_token))

    assert response.status_code == 200, response.text
    [only] = response.json()
    assert (only["lesson_id"], only["main"]["pages_seen"], only["main"]["total_pages"]) == (played["id"], 1, 2)


@pytest.mark.parametrize("who_asks", ["outsider", "teacher"])
async def test_el_progreso_propio_es_solo_del_peque_de_la_clase(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient, who_asks: str
) -> None:
    who = teacher(identity_client, classroom_client)
    await _lesson(client, who)
    token = who.token if who_asks == "teacher" else student(identity_client, classroom_client, uuid4())[1]

    response = await client.get(f"/classrooms/{who.classroom_id}/progress", headers=auth(token))

    assert response.status_code == (403 if who_asks == "teacher" else 404)
