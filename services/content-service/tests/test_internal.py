# The internal route classroom-service calls before deleting a classroom
# (HU-85): it takes every lesson of the classroom, with its blocks and its
# images, and only answers to the internal key.

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient

from tests.fakes import FakeClassroomClient, FakeIdentityClient, FakeObjectStorage
from tests.helpers import PNG, auth, lesson, page, teacher, unit

INTERNAL = {"X-Internal-Key": "test-internal-key"}

pytestmark = pytest.mark.asyncio


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _lesson_with_image(
    client: AsyncClient, identity: FakeIdentityClient, classrooms: FakeClassroomClient, classroom_id: UUID
) -> tuple[str, str]:
    who = teacher(identity, classrooms, classroom_id)
    created = await lesson(client, who, (await unit(client, who))["id"])
    lesson_id: str = created["id"]
    # One image used in a block and one uploaded but never used.
    used = await client.post(f"/lessons/{lesson_id}/images", files={"file": ("a.png", PNG, "image/png")}, headers=auth(who.token))
    await client.post(f"/lessons/{lesson_id}/images", files={"file": ("b.png", PNG, "image/png")}, headers=auth(who.token))
    await client.patch(
        f"/lessons/{lesson_id}",
        json={"blocks": page({"type": "imagen", "image_file": used.json()["image_file"], "alt_text": "Un gato"})},
        headers=auth(who.token),
    )
    return lesson_id, who.token


async def test_borra_las_lecciones_de_la_clase_con_todas_sus_imagenes(
    client: AsyncClient,
    identity_client: FakeIdentityClient,
    classroom_client: FakeClassroomClient,
    object_storage: FakeObjectStorage,
) -> None:
    classroom_id = uuid4()
    other_classroom = uuid4()
    gone, gone_token = await _lesson_with_image(client, identity_client, classroom_client, classroom_id)
    kept, kept_token = await _lesson_with_image(client, identity_client, classroom_client, other_classroom)

    response = await client.delete(f"/internal/classrooms/{classroom_id}/lessons", headers=INTERNAL)

    assert response.status_code == 204
    assert not any(key.startswith(f"lessons/{gone}/") for key in object_storage.files)
    assert sum(key.startswith(f"lessons/{kept}/") for key in object_storage.files) == 2
    assert (await client.get(f"/lessons/{gone}", headers=_auth(gone_token))).status_code == 404
    # Its units are gone too.
    assert (await client.get(f"/classrooms/{classroom_id}/units", headers=_auth(gone_token))).json() == []
    # The lesson of the other classroom is still there.
    assert (await client.get(f"/lessons/{kept}", headers=_auth(kept_token))).status_code == 200


async def test_una_clase_sin_lecciones_tambien_responde_204(client: AsyncClient) -> None:
    response = await client.delete(f"/internal/classrooms/{uuid4()}/lessons", headers=INTERNAL)

    assert response.status_code == 204


@pytest.mark.parametrize("headers", [{}, {"X-Internal-Key": "otra-llave"}])
async def test_sin_la_llave_interna_no_borra_nada(client: AsyncClient, headers: dict[str, str]) -> None:
    response = await client.delete(f"/internal/classrooms/{uuid4()}/lessons", headers=headers)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "acceso_interno_no_autorizado"
