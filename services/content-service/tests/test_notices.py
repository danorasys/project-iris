# What content-service asks classroom-service to tell (it knows who is in
# each class): a new lesson or a new extra for the families (HU-83), and
# what a kid finished for their teacher (HU-69).

from __future__ import annotations

from typing import Any

import pytest
from httpx import AsyncClient

from tests.fakes import FakeClassroomClient, FakeIdentityClient
from tests.helpers import COMPLETE_ACTIVITY, COMPLETE_PAGES, Teacher, auth, lesson, published_lesson, student, teacher, unit

pytestmark = pytest.mark.asyncio


async def _complete_draft(client: AsyncClient, who: Teacher) -> dict[str, Any]:
    created = await lesson(client, who, (await unit(client, who))["id"])
    await client.patch(f"/lessons/{created['id']}", json={"blocks": COMPLETE_PAGES}, headers=auth(who.token))
    await client.put(f"/lessons/{created['id']}/activity", json=COMPLETE_ACTIVITY, headers=auth(who.token))
    return created


# ---------------------------------------------------------------------------
# HU-83: new lessons and new extras
# ---------------------------------------------------------------------------


async def test_publicar_una_leccion_avisa_a_la_clase_solo_la_primera_vez(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    draft = await _complete_draft(client, who)

    first = await client.post(f"/lessons/{draft['id']}/publish", headers=auth(who.token))
    again = await client.post(f"/lessons/{draft['id']}/publish", headers=auth(who.token))

    assert first.status_code == again.status_code == 200
    assert [(a["kind"], a["lesson_title"], a["student_ids"]) for a in classroom_client.announcements] == [
        ("lesson.published", draft["title"], None)
    ]
    assert classroom_client.announcements[0]["classroom_id"] == who.classroom_id


async def test_un_extra_avisa_cuando_los_peques_ya_pueden_verlo(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    played = await published_lesson(client, who)
    kid, _ = student(identity_client, classroom_client, who.classroom_id)
    url = f"/lessons/{played['id']}/extras"
    created = await client.post(
        url,
        json={"kind": "actividad", "title": "Juego", "for_everyone": False, "student_ids": [str(kid)]},
        headers=auth(who.token),
    )
    extra_id = created.json()["id"]
    classroom_client.announcements.clear()

    # Still empty: nobody sees it yet. Then complete: only that kid hears.
    await client.patch(f"{url}/{extra_id}", json={"title": "Juego de animales"}, headers=auth(who.token))
    await client.put(f"{url}/{extra_id}/activity", json=COMPLETE_ACTIVITY, headers=auth(who.token))
    # Saving it again changes nothing for the kids.
    await client.put(f"{url}/{extra_id}/activity", json=COMPLETE_ACTIVITY, headers=auth(who.token))

    assert [(a["kind"], a["extra_title"], a["student_ids"]) for a in classroom_client.announcements] == [
        ("extra.published", "Juego de animales", [kid])
    ]


async def test_un_extra_de_una_leccion_sin_publicar_no_avisa(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    draft = await _complete_draft(client, who)
    url = f"/lessons/{draft['id']}/extras"
    extra_id = (await client.post(url, json={"kind": "contenido", "title": "Más"}, headers=auth(who.token))).json()["id"]

    await client.patch(f"{url}/{extra_id}", json={"blocks": COMPLETE_PAGES}, headers=auth(who.token))

    assert classroom_client.announcements == []


# ---------------------------------------------------------------------------
# HU-69: what a kid finished, for the teacher
# ---------------------------------------------------------------------------


async def test_terminar_la_lectura_se_reporta_una_sola_vez(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    played = await published_lesson(client, who)
    kid, kid_token = student(identity_client, classroom_client, who.classroom_id)
    url = f"/lessons/{played['id']}/progress"
    total = len({b["page_index"] for b in played["blocks"]})

    await client.put(url, json={"page": total}, headers=auth(kid_token))
    # Back to read again, and to the end once more.
    await client.put(url, json={"page": 1}, headers=auth(kid_token))
    await client.put(url, json={"page": total}, headers=auth(kid_token))

    assert [(r["kind"], r["student_id"], r["score"]) for r in classroom_client.reports] == [
        ("lesson.content_completed", kid, None)
    ]


async def test_solo_el_primer_intento_de_la_actividad_se_reporta(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    played = await published_lesson(client, who)
    _kid, kid_token = student(identity_client, classroom_client, who.classroom_id)
    activity = (await client.get(f"/lessons/{played['id']}/play", headers=auth(kid_token))).json()["activity"]
    answers = [{"question_id": q["id"], "option_id": q["options"][0]["id"]} for q in activity["questions"]]

    first = await client.post(f"/lessons/{played['id']}/attempts", json={"answers": answers}, headers=auth(kid_token))
    await client.post(f"/lessons/{played['id']}/attempts", json={"answers": answers}, headers=auth(kid_token))

    [report] = classroom_client.reports
    assert report["kind"] == "lesson.activity_completed"
    assert report["score"] == (first.json()["correct"], first.json()["total"])
