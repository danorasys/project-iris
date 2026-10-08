# The summary of the Inicio (units and lessons per classroom of the teacher):
# it counts only their own content and only teachers can ask for it.

from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient

from tests.fakes import FakeClassroomClient, FakeIdentityClient
from tests.helpers import auth, lesson, published_lesson, student, teacher, unit

pytestmark = pytest.mark.asyncio


async def test_cuenta_unidades_y_lecciones_de_cada_clase(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    first = await unit(client, who, "Los animales")
    await unit(client, who, "Las plantas")
    await published_lesson(client, who, first["id"])
    await lesson(client, who, first["id"], "Animales del mar")
    await lesson(client, who, first["id"], "Animales del aire")

    response = await client.get("/teachers/me/content-summary", headers=auth(who.token))

    assert response.status_code == 200
    assert response.json() == [
        {"classroom_id": str(who.classroom_id), "units": 2, "published_lessons": 1, "draft_lessons": 2}
    ]


async def test_no_cuenta_lo_de_otro_docente(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    mine = teacher(identity_client, classroom_client)
    other = teacher(identity_client, classroom_client)
    await unit(client, other, "De otra clase")

    response = await client.get("/teachers/me/content-summary", headers=auth(mine.token))

    assert response.status_code == 200
    assert response.json() == []


async def test_un_estudiante_no_puede_pedirlo(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    _, token = student(identity_client, classroom_client, uuid4())

    response = await client.get("/teachers/me/content-summary", headers=auth(token))

    assert response.status_code == 403
