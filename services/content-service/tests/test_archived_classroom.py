# An archived class (HU-105) keeps its units and lessons for reading, but
# nothing in it can be created, changed, published or deleted, even calling
# the API directly: classroom-service says the teacher isn't its editor.

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.fakes import FakeClassroomClient, FakeIdentityClient
from tests.helpers import auth, lesson, teacher, unit

pytestmark = pytest.mark.asyncio


async def test_en_una_clase_archivada_no_se_cambia_nada_pero_se_lee(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    animals = await unit(client, who, "Los animales")
    draft = await lesson(client, who, animals["id"])
    classroom_client.authorize(who.classroom_id, who.id, "editor", authorized=False)
    headers = auth(who.token)

    answers = [
        await client.post(
            f"/classrooms/{who.classroom_id}/units",
            json={"title": "Las plantas", "guiding_question": "¿Cómo crecen?"},
            headers=headers,
        ),
        await client.patch(f"/units/{animals['id']}", json={"title": "Otra"}, headers=headers),
        await client.put(
            f"/classrooms/{who.classroom_id}/units/order", json={"ids": [animals["id"]]}, headers=headers
        ),
        await client.post(
            f"/units/{animals['id']}/lessons",
            json={"title": "Nueva", "purpose": "Aprender algo.", "learning_goal": "Reconozco algo."},
            headers=headers,
        ),
        await client.patch(f"/lessons/{draft['id']}", json={"title": "Otra"}, headers=headers),
        await client.post(f"/lessons/{draft['id']}/publish", headers=headers),
        await client.delete(f"/lessons/{draft['id']}", headers=headers),
    ]
    listed = await client.get(f"/classrooms/{who.classroom_id}/units", headers=headers)
    opened = await client.get(f"/lessons/{draft['id']}", headers=headers)

    assert [r.status_code for r in answers] == [409] * len(answers)
    assert {r.json()["error"]["code"] for r in answers} == {"clase_no_editable"}
    assert [u["title"] for u in listed.json()] == ["Los animales"]
    assert opened.status_code == 200
