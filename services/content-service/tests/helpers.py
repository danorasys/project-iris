# Small helpers shared by the tests: a teacher with their classroom, a unit,
# a lesson and the pieces a lesson needs to be published.

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID, uuid4

from httpx import AsyncClient

from tests.fakes import FakeClassroomClient, FakeIdentityClient

PNG = b"\x89PNG\r\n\x1a\n" + b"datos-de-prueba"
JPEG = b"\xff\xd8\xff" + b"datos-de-prueba"


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@dataclass
class Teacher:
    id: UUID
    token: str
    classroom_id: UUID


def teacher(identity: FakeIdentityClient, classrooms: FakeClassroomClient, classroom_id: UUID | None = None) -> Teacher:
    teacher_id = uuid4()
    token = f"token-docente-{teacher_id.hex[:8]}"
    classroom = classroom_id or uuid4()
    identity.register(token, teacher_id, "teacher")
    classrooms.authorize(classroom, teacher_id, "teacher", authorized=True)
    return Teacher(id=teacher_id, token=token, classroom_id=classroom)


def student(identity: FakeIdentityClient, classrooms: FakeClassroomClient, classroom_id: UUID) -> tuple[UUID, str]:
    student_id = uuid4()
    token = f"token-estudiante-{student_id.hex[:8]}"
    identity.register(token, student_id, "student")
    classrooms.authorize(classroom_id, student_id, "student", authorized=True)
    return student_id, token


async def unit(client: AsyncClient, who: Teacher, title: str = "Los animales") -> dict[str, Any]:
    response = await client.post(
        f"/classrooms/{who.classroom_id}/units",
        json={"title": title, "guiding_question": "¿Dónde viven los animales?"},
        headers=auth(who.token),
    )
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


async def lesson(client: AsyncClient, who: Teacher, unit_id: str, title: str = "Animales terrestres") -> dict[str, Any]:
    response = await client.post(
        f"/units/{unit_id}/lessons",
        json={
            "title": title,
            "purpose": "Hoy vas a aprender qué animales viven en la tierra.",
            "learning_goal": "Identifico dónde viven algunos animales.",
        },
        headers=auth(who.token),
    )
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


def page(*blocks: dict[str, Any], page_index: int = 0) -> list[dict[str, Any]]:
    return [{**block, "page_index": page_index, "order_index": index} for index, block in enumerate(blocks)]


COMPLETE_PAGES = page({"type": "titulo", "text": "Los animales de la tierra"}, {"type": "texto", "text": "El perro vive en la tierra."})

COMPLETE_ACTIVITY = {
    "pass_threshold": 1,
    "questions": [
        {
            "prompt": "¿Dónde vive el perro?",
            "options": [{"text": "En la tierra", "is_correct": True}, {"text": "En el mar", "is_correct": False}],
        }
    ],
}


# A lesson with everything it needs, published.
async def published_lesson(client: AsyncClient, who: Teacher, unit_id: str | None = None) -> dict[str, Any]:
    unit_id = unit_id or (await unit(client, who))["id"]
    created = await lesson(client, who, unit_id)
    await client.patch(f"/lessons/{created['id']}", json={"blocks": COMPLETE_PAGES}, headers=auth(who.token))
    await client.put(f"/lessons/{created['id']}/activity", json=COMPLETE_ACTIVITY, headers=auth(who.token))
    response = await client.post(f"/lessons/{created['id']}/publish", headers=auth(who.token))
    assert response.status_code == 200, response.text
    published: dict[str, Any] = response.json()
    return published
