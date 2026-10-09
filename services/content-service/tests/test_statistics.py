# The statistics of a class for its teacher (HU-86, HU-87), asked by
# classroom-service with the kids that are in the class.

from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.config import get_settings
from tests.fakes import FakeClassroomClient, FakeIdentityClient
from tests.test_progress import TWO_QUESTIONS, _answers, _lesson
from tests.helpers import auth, student, teacher

pytestmark = pytest.mark.asyncio


def _internal() -> dict[str, str]:
    return {"X-Internal-Key": get_settings().internal_service_key}


async def _try(client: AsyncClient, lesson_id: str, token: str, right: list[bool]) -> None:
    activity = (await client.get(f"/lessons/{lesson_id}/play", headers=auth(token))).json()["activity"]
    response = await client.post(
        f"/lessons/{lesson_id}/attempts", json={"answers": _answers(activity, right)}, headers=auth(token)
    )
    assert response.status_code == 201, response.text


async def _stats(client: AsyncClient, classroom_id: Any, kids: list[Any]) -> dict[str, Any]:
    response = await client.get(
        f"/internal/classrooms/{classroom_id}/statistics",
        params={"student_id": [str(k) for k in kids]},
        headers=_internal(),
    )
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


async def test_las_estadisticas_de_una_leccion_y_de_la_clase(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    first = await _lesson(client, who, title="Animales")
    await _lesson(client, who, unit_id=first["unit_id"], title="Plantas")
    ana, ana_token = student(identity_client, classroom_client, who.classroom_id)
    beto, beto_token = student(identity_client, classroom_client, who.classroom_id)
    caro, caro_token = student(identity_client, classroom_client, who.classroom_id)
    dani, _ = student(identity_client, classroom_client, who.classroom_id)
    url = f"/lessons/{first['id']}/progress"
    # Ana reads it all and gets both right; Beto reads it all and fails, then
    # gets one right; Caro only reads the first page; Dani doesn't start.
    await client.put(url, json={"page": 2}, headers=auth(ana_token))
    await _try(client, first["id"], ana_token, [True, True])
    await client.put(url, json={"page": 2}, headers=auth(beto_token))
    await _try(client, first["id"], beto_token, [False, False])
    await _try(client, first["id"], beto_token, [True, False])
    await client.put(url, json={"page": 1}, headers=auth(caro_token))

    stats = await _stats(client, who.classroom_id, [ana, beto, caro, dani])

    animals, plants = stats["lessons"]
    assert (animals["title"], plants["title"]) == ("Animales", "Plantas")
    assert (animals["completed"], animals["in_progress"], animals["not_started"]) == (2, 1, 1)
    assert (animals["passed"], animals["tried_not_passed"]) == (2, 0)
    assert animals["average_percent"] == round((100 + 100 + 33 + 0) / 4)
    # Best first: Ana (2 of 2), Beto (his best try, 1 of 2), then who didn't try.
    ranking = [(k["student_id"], k["best_correct"], k["tries"]) for k in animals["kids"]]
    assert ranking[:2] == [(str(ana), 2, 1), (str(beto), 1, 2)]
    assert {k[0] for k in ranking[2:]} == {str(caro), str(dani)}
    assert plants["not_started"] == 4
    # 2 completed out of 4 kids x 2 lessons.
    assert (stats["kids"], stats["completed_percent"]) == (4, 25)
    assert stats["by_kid"][0] == {"student_id": str(ana), "average_percent": 50, "completed_lessons": 1}


async def test_un_extra_no_cuenta_en_las_estadisticas(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    played = await _lesson(client, who)
    kid, kid_token = student(identity_client, classroom_client, who.classroom_id)
    url = f"/lessons/{played['id']}/extras"
    extra = (await client.post(url, json={"kind": "actividad", "title": "Juego"}, headers=auth(who.token))).json()
    await client.put(f"{url}/{extra['id']}/activity", json=TWO_QUESTIONS, headers=auth(who.token))
    activity = (await client.get(f"/lessons/{played['id']}/play", headers=auth(kid_token))).json()["extras"][0][
        "activity"
    ]
    await client.post(
        f"/lessons/{played['id']}/attempts",
        json={"extra_id": extra["id"], "answers": _answers(activity, [True, True])},
        headers=auth(kid_token),
    )

    [lesson] = (await _stats(client, who.classroom_id, [kid]))["lessons"]

    assert (lesson["passed"], lesson["kids"][0]["tries"]) == (0, 0)


async def test_una_clase_sin_peques_ni_lecciones(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    stats = await _stats(client, uuid4(), [])

    assert stats == {"kids": 0, "lessons": [], "completed_percent": 0, "average_percent": 0, "by_kid": []}


async def test_las_estadisticas_son_solo_para_otros_servicios(client: AsyncClient) -> None:
    response = await client.get(f"/internal/classrooms/{uuid4()}/statistics")

    assert response.status_code == 401


async def test_borrar_a_los_peques_de_un_tutor(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    played = await _lesson(client, who)
    kid, kid_token = student(identity_client, classroom_client, who.classroom_id)
    other, other_token = student(identity_client, classroom_client, who.classroom_id)
    url = f"/lessons/{played['id']}/extras"
    await client.post(
        url, json={"kind": "contenido", "title": "Solo para ellos", "for_everyone": False, "student_ids": [str(kid), str(other)]},
        headers=auth(who.token),
    )
    for token in (kid_token, other_token):
        await client.put(f"/lessons/{played['id']}/progress", json={"page": 1}, headers=auth(token))
        await _try(client, played["id"], token, [True, True])

    erased = await client.post("/internal/erasures/students", json={"student_ids": [str(kid)]}, headers=_internal())
    again = await client.post("/internal/erasures/students", json={"student_ids": [str(kid)]}, headers=_internal())
    stats = await _stats(client, who.classroom_id, [kid, other])
    extra = (await client.get(f"/lessons/{played['id']}", headers=auth(who.token))).json()["extras"][0]

    # A page, a try and the place in the extra.
    assert erased.json() == {"rows_deleted": 3}
    assert again.json() == {"rows_deleted": 0}
    by_kid = {k["student_id"]: k for k in stats["lessons"][0]["kids"]}
    assert (by_kid[str(kid)]["tries"], by_kid[str(kid)]["percent"]) == (0, 0)
    assert by_kid[str(other)]["tries"] == 1
    assert extra["student_ids"] == [str(other)]


async def test_borrar_peques_es_solo_para_otros_servicios(client: AsyncClient) -> None:
    response = await client.post("/internal/erasures/students", json={"student_ids": []})

    assert response.status_code == 401
