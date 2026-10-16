# Archiving, restoring and deleting a class (HU-105, HU-85, ADR 0021): an
# archived class is only for reading, its families hear about every change,
# deleting needs it archived first, and each step leaves an audit line that
# outlives the class.

from __future__ import annotations

import asyncio
import json
from uuid import UUID

import fakeredis.aioredis
import pytest
from httpx import AsyncClient

from app.config import get_settings
from app.infrastructure.db import SessionLocal
from app.infrastructure.repositories import SqlAlchemyAuditLogRepository
from tests.fakes import FakeContentGateway, FakeIdentityGateway
from tests.helpers import auth, pedir_ingreso

pytestmark = pytest.mark.asyncio


def _internal() -> dict[str, str]:
    return {"X-Internal-Key": get_settings().internal_service_key}


async def _classroom(client: AsyncClient, teacher_token: str) -> dict:
    response = await client.post(
        "/classrooms",
        json={"name": "Ciencias 1A", "description": "d", "area": "natural_sciences", "grade": 1},
        headers=auth(teacher_token),
    )
    assert response.status_code == 201, response.text
    classroom: dict = response.json()
    return classroom


async def _join(client: AsyncClient, teacher_token: str, classroom: dict, kid_token: str, accept: bool = True) -> str:
    enrollment_id: str = (await pedir_ingreso(client, classroom["enrollment_code"], kid_token)).json()["enrollment_id"]
    if accept:
        await client.post(
            f"/classrooms/{classroom['id']}/requests/{enrollment_id}/resolve",
            json={"decision": "aceptar"},
            headers=auth(teacher_token),
        )
    return enrollment_id


async def _next_event(pubsub: fakeredis.aioredis.client.PubSub) -> dict:
    for _ in range(50):
        message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.1)
        if message is not None:
            event: dict = json.loads(message["data"])
            return event
        await asyncio.sleep(0.01)
    raise AssertionError("No llegó ningún evento al canal.")


async def _audit(classroom_id: str) -> list[tuple[str, int, int]]:
    async with SessionLocal() as session:
        lines = await SqlAlchemyAuditLogRepository(session).list_by_classroom(UUID(classroom_id))
    return [(line.action, line.student_count, line.pending_count) for line in lines]


async def test_archivar_cierra_las_solicitudes_y_avisa_a_las_familias(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    teacher_token, _ = identity_gateway.registrar_docente(nombre="Laura Gómez")
    classroom = await _classroom(client, teacher_token)
    kid_token, _ = identity_gateway.registrar_estudiante_token(nombres="Sofía")
    waiting_token, _ = identity_gateway.registrar_estudiante_token(nombres="Tomás")
    in_class = await _join(client, teacher_token, classroom, kid_token)
    waiting = await _join(client, teacher_token, classroom, waiting_token, accept=False)
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("classroom.requests")

    archived = await client.post(f"/classrooms/{classroom['id']}/archive", headers=auth(teacher_token))
    event = await _next_event(pubsub)

    assert archived.status_code == 200
    assert archived.json()["archived_at"] is not None
    assert (event["event"], event["classroom_name"], event["teacher_name"]) == (
        "classroom.archived",
        "Ciencias 1A",
        "Laura Gómez",
    )
    members = {m["enrollment_id"]: m for m in event["members"]}
    assert members[in_class]["student_name"] == "Sofía Pérez"
    assert "request_closed" not in members[in_class]
    assert members[waiting]["request_closed"] is True
    assert members[waiting]["guardian_id"] == str(identity_gateway.guardian_person_id)
    # The request that was waiting is gone from the teacher's list.
    requests = await client.get(f"/classrooms/{classroom['id']}/requests", headers=auth(teacher_token))
    assert requests.json() == []
    assert await _audit(classroom["id"]) == [("created", 0, 0), ("archived", 1, 1)]
    await pubsub.aclose()


async def test_archivar_dos_veces_no_cambia_nada(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    teacher_token, _ = identity_gateway.registrar_docente()
    classroom = await _classroom(client, teacher_token)

    first = await client.post(f"/classrooms/{classroom['id']}/archive", headers=auth(teacher_token))
    second = await client.post(f"/classrooms/{classroom['id']}/archive", headers=auth(teacher_token))

    # Same moment; SQLite (the tests) gives it back without its "Z".
    assert first.json()["archived_at"].rstrip("Z") == second.json()["archived_at"].rstrip("Z")
    assert [action for action, _, _ in await _audit(classroom["id"])] == ["created", "archived"]


async def test_una_clase_archivada_no_recibe_solicitudes_ni_cambios(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    teacher_token, _ = identity_gateway.registrar_docente()
    classroom = await _classroom(client, teacher_token)
    kid_token, _ = identity_gateway.registrar_estudiante_token(nombres="Sofía")
    enrollment_id = await _join(client, teacher_token, classroom, kid_token)
    await client.post(f"/classrooms/{classroom['id']}/archive", headers=auth(teacher_token))
    new_kid, _ = identity_gateway.registrar_estudiante_token(nombres="Tomás")
    guardian = identity_gateway.tutor_de(kid_token)

    lookup = await client.post(
        "/classrooms/family/lookup", json={"enrollment_code": classroom["enrollment_code"]}, headers=auth(guardian)
    )
    request = await pedir_ingreso(client, classroom["enrollment_code"], new_kid)
    edit = await client.patch(f"/classrooms/{classroom['id']}", json={"name": "Otra"}, headers=auth(teacher_token))
    remove_logo = await client.delete(f"/classrooms/{classroom['id']}/logo", headers=auth(teacher_token))
    take_out = await client.delete(
        f"/classrooms/{classroom['id']}/students/{enrollment_id}", headers=auth(teacher_token)
    )
    to_family = await client.post(
        f"/classrooms/{classroom['id']}/students/{enrollment_id}/messages",
        json={"recipient": "guardian", "subject": "Hola", "body": "Un saludo"},
        headers=auth(teacher_token),
    )
    to_teacher = await client.post(
        f"/classrooms/family/{enrollment_id}/messages",
        json={"subject": "Hola", "body": "Un saludo"},
        headers=auth(guardian),
    )

    answers = [lookup, request, edit, remove_logo, take_out, to_family, to_teacher]
    assert [r.status_code for r in answers] == [409] * len(answers)
    assert {r.json()["error"]["code"] for r in answers} == {"clase_archivada"}


async def test_una_clase_archivada_se_puede_consultar(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    teacher_token, teacher_id = identity_gateway.registrar_docente()
    classroom = await _classroom(client, teacher_token)
    kid_token, kid = identity_gateway.registrar_estudiante_token(nombres="Sofía")
    enrollment_id = await _join(client, teacher_token, classroom, kid_token)
    await client.post(f"/classrooms/{classroom['id']}/archive", headers=auth(teacher_token))
    guardian = identity_gateway.tutor_de(kid_token)

    # The teacher still sees it with its members, marked as archived.
    detail = await client.get(f"/classrooms/{classroom['id']}", headers=auth(teacher_token))
    [listed] = (await client.get("/classrooms", headers=auth(teacher_token))).json()
    # The family too, with its space.
    [family] = (await client.get("/classrooms/family", headers=auth(guardian))).json()
    space = await client.get(f"/classrooms/family/{enrollment_id}", headers=auth(guardian))
    # The kid doesn't see it anymore, nor can open its lessons.
    mine = await client.get("/classrooms/mine", headers=auth(kid_token))
    access = {
        role: (
            await client.get(
                f"/internal/classrooms/{classroom['id']}/access",
                params={"subject_id": str(subject), "role": role},
                headers=_internal(),
            )
        ).json()["authorized"]
        for role, subject in (("teacher", teacher_id), ("editor", teacher_id), ("student", kid))
    }

    assert detail.status_code == 200
    assert [s["first_name"] for s in detail.json()["students"]] == ["Sofía"]
    assert listed["archived_at"] is not None
    assert family["archived_at"] is not None
    assert space.status_code == 200
    assert space.json()["archived_at"] is not None
    assert mine.json() == []
    assert access == {"teacher": True, "editor": False, "student": False}


async def test_restaurar_la_devuelve_a_las_clases_activas(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    teacher_token, teacher_id = identity_gateway.registrar_docente()
    classroom = await _classroom(client, teacher_token)
    kid_token, _ = identity_gateway.registrar_estudiante_token(nombres="Sofía")
    enrollment_id = await _join(client, teacher_token, classroom, kid_token)
    await client.post(f"/classrooms/{classroom['id']}/archive", headers=auth(teacher_token))
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("classroom.requests")

    restored = await client.post(f"/classrooms/{classroom['id']}/restore", headers=auth(teacher_token))
    event = await _next_event(pubsub)

    assert restored.json()["archived_at"] is None
    assert event["event"] == "classroom.restored"
    assert [m["enrollment_id"] for m in event["members"]] == [enrollment_id]
    [mine] = (await client.get("/classrooms/mine", headers=auth(kid_token))).json()
    assert mine["id"] == classroom["id"]
    editor = await client.get(
        f"/internal/classrooms/{classroom['id']}/access",
        params={"subject_id": str(teacher_id), "role": "editor"},
        headers=_internal(),
    )
    assert editor.json()["authorized"] is True
    assert [action for action, _, _ in await _audit(classroom["id"])] == ["created", "archived", "restored"]
    await pubsub.aclose()


async def test_una_clase_activa_no_se_puede_eliminar(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, content_gateway: FakeContentGateway
) -> None:
    teacher_token, _ = identity_gateway.registrar_docente()
    classroom = await _classroom(client, teacher_token)

    response = await client.delete(f"/classrooms/{classroom['id']}", headers=auth(teacher_token))

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "clase_no_archivada"
    assert content_gateway.deleted == []


async def test_eliminar_deja_la_constancia_y_avisa_a_las_familias(
    client: AsyncClient,
    identity_gateway: FakeIdentityGateway,
    content_gateway: FakeContentGateway,
    redis_client: fakeredis.aioredis.FakeRedis,
) -> None:
    teacher_token, _ = identity_gateway.registrar_docente(nombre="Laura Gómez")
    classroom = await _classroom(client, teacher_token)
    kid_token, _ = identity_gateway.registrar_estudiante_token(nombres="Sofía")
    enrollment_id = await _join(client, teacher_token, classroom, kid_token)
    await client.post(f"/classrooms/{classroom['id']}/archive", headers=auth(teacher_token))
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("classroom.requests")

    deleted = await client.delete(f"/classrooms/{classroom['id']}", headers=auth(teacher_token))
    event = await _next_event(pubsub)

    assert deleted.status_code == 204
    assert [str(c) for c in content_gateway.deleted] == [classroom["id"]]
    assert (event["event"], event["classroom_name"], event["teacher_name"]) == (
        "classroom.deleted",
        "Ciencias 1A",
        "Laura Gómez",
    )
    assert [m["enrollment_id"] for m in event["members"]] == [enrollment_id]
    # The class is gone, its log stays.
    assert (await client.get(f"/classrooms/{classroom['id']}", headers=auth(teacher_token))).status_code == 404
    assert await _audit(classroom["id"]) == [("created", 0, 0), ("archived", 1, 0), ("deleted", 1, 0)]
    await pubsub.aclose()


async def test_el_docente_que_se_va_deja_su_linea_en_cada_clase(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    teacher_token, teacher_id = identity_gateway.registrar_docente()
    classroom = await _classroom(client, teacher_token)
    kid_token, _ = identity_gateway.registrar_estudiante_token(nombres="Sofía")
    await _join(client, teacher_token, classroom, kid_token)

    await client.post(f"/internal/erasures/teachers/{teacher_id}", headers=_internal())
    await client.post(f"/internal/erasures/teachers/{teacher_id}", headers=_internal())

    assert await _audit(classroom["id"]) == [("created", 0, 0), ("teacher_left", 1, 0)]


async def test_archivar_es_solo_del_docente_de_la_clase(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    teacher_token, _ = identity_gateway.registrar_docente()
    other_token, _ = identity_gateway.registrar_docente()
    classroom = await _classroom(client, teacher_token)

    archive = await client.post(f"/classrooms/{classroom['id']}/archive", headers=auth(other_token))
    restore = await client.post(f"/classrooms/{classroom['id']}/restore", headers=auth(other_token))

    assert archive.status_code == restore.status_code == 403
    assert [action for action, _, _ in await _audit(classroom["id"])] == ["created"]
