# The guardian handles their kid's classes from the parents' portal (EP-07,
# ADR 0016): finds a class by its code and sees its teacher, asks to join,
# enters the space of a class, writes to the teacher and takes the kid out.
# Always behind the portal's 2FA code and only for their own kids.

from __future__ import annotations

import asyncio
import json
from uuid import UUID

import fakeredis.aioredis
import pytest
from httpx import AsyncClient

from app.config import get_settings
from tests.fakes import FakeContentGateway, FakeIdentityGateway, FakeObjectStorage
from tests.helpers import auth

pytestmark = pytest.mark.asyncio

PNG = b"\x89PNG\r\n\x1a\n" + b"datos-de-prueba"


async def _classroom(client: AsyncClient, teacher_token: str, name: str = "Matemáticas") -> dict:
    payload = {"name": name, "description": "Sumas y restas", "area": "mathematics", "grade": 2}
    response = await client.post("/classrooms", json=payload, headers=auth(teacher_token))
    assert response.status_code == 201, response.text
    result: dict = response.json()
    return result


# A teacher with a class, and a guardian with one kid (Sofía).
async def _family(client: AsyncClient, identity: FakeIdentityGateway) -> tuple[str, dict, str, str]:
    teacher_token, _ = identity.registrar_docente(nombre="Laura Gómez")
    classroom = await _classroom(client, teacher_token)
    _kid_token, kid = identity.registrar_estudiante_token(nombres="Sofía")
    guardian_token, _ = identity.registrar_tutor_con_peques(kid)
    return teacher_token, classroom, guardian_token, str(kid)


async def _ask(client: AsyncClient, guardian_token: str, kid: str, code: str) -> str:
    response = await client.post(
        "/classrooms/family/requests", json={"student_id": kid, "enrollment_code": code}, headers=auth(guardian_token)
    )
    assert response.status_code == 201, response.text
    enrollment_id: str = response.json()["enrollment_id"]
    return enrollment_id


async def _answer(client: AsyncClient, teacher_token: str, classroom: dict, enrollment_id: str, decision: str) -> None:
    response = await client.post(
        f"/classrooms/{classroom['id']}/requests/{enrollment_id}/resolve",
        json={"decision": decision},
        headers=auth(teacher_token),
    )
    assert response.status_code == 200, response.text


async def _next_event(pubsub: fakeredis.aioredis.client.PubSub) -> dict:
    for _ in range(50):
        message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.1)
        if message is not None:
            event: dict = json.loads(message["data"])
            return event
        await asyncio.sleep(0.01)
    raise AssertionError("No llegó ningún evento al canal.")


# ---------------------------------------------------------------------------
# HU-40 and HU-97: find the class by its code, with its teacher
# ---------------------------------------------------------------------------


async def test_el_codigo_muestra_la_clase_y_el_perfil_del_docente(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, content_gateway: FakeContentGateway
) -> None:
    _teacher, classroom, guardian_token, _kid = await _family(client, identity_gateway)
    content_gateway.published[UUID(classroom["id"])] = 4
    content_gateway.published_units[UUID(classroom["id"])] = 2

    # Typed in lowercase and with spaces, the way a family may copy it.
    typed = f"  {classroom['enrollment_code'].lower()} "
    response = await client.post("/classrooms/family/lookup", json={"enrollment_code": typed}, headers=auth(guardian_token))

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["classroom_id"], body["name"], body["published_lessons"]) == (classroom["id"], "Matemáticas", 4)
    assert body["published_units"] == 2
    assert body["teacher"]["first_name"] == "Laura" and body["teacher"]["last_name"] == "Gómez"
    assert body["teacher"]["studies"][0]["title"] == "Licenciatura"
    assert body["teacher"]["institution"] == "Colegio Nacional"
    # Not the code back, nor the teacher's id.
    assert "enrollment_code" not in body and "teacher_id" not in body


async def test_un_codigo_que_no_existe_da_404(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    _teacher, _classroom_, guardian_token, _kid = await _family(client, identity_gateway)

    response = await client.post(
        "/classrooms/family/lookup", json={"enrollment_code": "ZZ9#ZZ9%"}, headers=auth(guardian_token)
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "codigo_ingreso_invalido"


async def test_buscar_codigos_tiene_limite(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    _teacher, _classroom_, guardian_token, _kid = await _family(client, identity_gateway)

    statuses = [
        (
            await client.post(
                "/classrooms/family/lookup", json={"enrollment_code": "ZZ9#ZZ9%"}, headers=auth(guardian_token)
            )
        ).status_code
        for _ in range(get_settings().rate_limit_lookup_max + 1)
    ]

    assert statuses[-1] == 429
    assert set(statuses[:-1]) == {404}


async def test_sin_identity_la_clase_se_ve_sin_docente(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    _teacher, classroom, guardian_token, _kid = await _family(client, identity_gateway)

    async def unavailable(*_args: object) -> None:
        from app.domain.exceptions import IdentityServiceUnavailable

        raise IdentityServiceUnavailable()

    identity_gateway.get_teacher_profile = unavailable  # type: ignore[method-assign]
    response = await client.post(
        "/classrooms/family/lookup", json={"enrollment_code": classroom["enrollment_code"]}, headers=auth(guardian_token)
    )

    assert response.status_code == 200
    assert response.json()["teacher"] is None


# ---------------------------------------------------------------------------
# HU-40 and HU-41: ask to join, and follow how it goes
# ---------------------------------------------------------------------------


async def test_el_tutor_pide_el_ingreso_y_el_docente_lo_sabe(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("classroom.requests")
    teacher_token, classroom, guardian_token, kid = await _family(client, identity_gateway)

    enrollment_id = await _ask(client, guardian_token, kid, classroom["enrollment_code"])
    event = await _next_event(pubsub)
    requests = await client.get(f"/classrooms/{classroom['id']}/requests", headers=auth(teacher_token))
    family = await client.get("/classrooms/family", headers=auth(guardian_token))

    assert event["event"] == "request.created"
    assert (event["student_name"], event["guardian_name"]) == ("Sofía", "Ana Pérez")
    assert [r["enrollment_id"] for r in requests.json()] == [enrollment_id]
    assert [(c["enrollment_id"], c["status"]) for c in family.json()] == [(enrollment_id, "pendiente")]
    await pubsub.aclose()


async def test_no_se_puede_pedir_por_un_peque_ajeno(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    _teacher, classroom, _guardian, kid = await _family(client, identity_gateway)
    other_guardian, _ = identity_gateway.registrar_tutor_con_peques()

    response = await client.post(
        "/classrooms/family/requests",
        json={"student_id": kid, "enrollment_code": classroom["enrollment_code"]},
        headers=auth(other_guardian),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "peque_no_encontrado"


async def test_no_se_repite_una_pendiente_ni_una_aceptada_pero_si_una_rechazada(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    teacher_token, classroom, guardian_token, kid = await _family(client, identity_gateway)
    code = classroom["enrollment_code"]
    body = {"student_id": kid, "enrollment_code": code}

    enrollment_id = await _ask(client, guardian_token, kid, code)
    while_pending = await client.post("/classrooms/family/requests", json=body, headers=auth(guardian_token))
    await _answer(client, teacher_token, classroom, enrollment_id, "rechazar")
    after_rejected = await client.post("/classrooms/family/requests", json=body, headers=auth(guardian_token))
    await _answer(client, teacher_token, classroom, enrollment_id, "aceptar")
    while_inside = await client.post("/classrooms/family/requests", json=body, headers=auth(guardian_token))

    assert while_pending.status_code == 409
    assert after_rejected.status_code == 201 and after_rejected.json()["enrollment_id"] == enrollment_id
    assert while_inside.status_code == 409
    assert while_inside.json()["error"]["code"] == "ya_inscrito_o_pendiente"


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/classrooms/family/lookup"),
        ("post", "/classrooms/family/requests"),
        ("get", "/classrooms/family/00000000-0000-0000-0000-000000000000"),
        ("delete", "/classrooms/family/00000000-0000-0000-0000-000000000000"),
        ("post", "/classrooms/family/00000000-0000-0000-0000-000000000000/messages"),
        ("get", "/classrooms/family/00000000-0000-0000-0000-000000000000/progress"),
    ],
)
async def test_todo_pide_el_codigo_del_portal(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, method: str, path: str
) -> None:
    token, _ = identity_gateway.registrar_tutor_con_peques()
    identity_gateway.portal_open = False

    response = await client.request(method.upper(), path, json={}, headers=auth(token))

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "acceso_portal_requerido"


async def test_un_estudiante_ya_no_puede_pedir_el_ingreso(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    kid_token, kid = identity_gateway.registrar_estudiante_token()

    old_route = await client.post("/classrooms/enroll", json={"enrollment_code": "1234567"}, headers=auth(kid_token))
    new_route = await client.post(
        "/classrooms/family/requests",
        json={"student_id": str(kid), "enrollment_code": "AB3#CD4%"},
        headers=auth(kid_token),
    )

    assert old_route.status_code in (404, 405)
    assert new_route.status_code == 403


# ---------------------------------------------------------------------------
# HU-42 and HU-97: the space of a class
# ---------------------------------------------------------------------------


async def test_el_espacio_de_la_clase_trae_al_docente(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    teacher_token, classroom, guardian_token, kid = await _family(client, identity_gateway)
    enrollment_id = await _ask(client, guardian_token, kid, classroom["enrollment_code"])

    while_pending = await client.get(f"/classrooms/family/{enrollment_id}", headers=auth(guardian_token))
    await _answer(client, teacher_token, classroom, enrollment_id, "aceptar")
    inside = await client.get(f"/classrooms/family/{enrollment_id}", headers=auth(guardian_token))

    assert while_pending.status_code == 409
    assert inside.status_code == 200
    body = inside.json()
    assert (body["name"], body["status"], body["teacher_name"]) == ("Matemáticas", "aceptada", "Laura Gómez")
    assert body["teacher"]["experiences"][0]["place"] == "Colegio San José"
    assert body["resolved_at"] is not None


async def test_el_espacio_de_otra_familia_no_existe(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    teacher_token, classroom, guardian_token, kid = await _family(client, identity_gateway)
    enrollment_id = await _ask(client, guardian_token, kid, classroom["enrollment_code"])
    await _answer(client, teacher_token, classroom, enrollment_id, "aceptar")
    other_guardian, _ = identity_gateway.registrar_tutor_con_peques()

    seen = await client.get(f"/classrooms/family/{enrollment_id}", headers=auth(other_guardian))
    removed = await client.delete(f"/classrooms/family/{enrollment_id}", headers=auth(other_guardian))
    written = await client.post(
        f"/classrooms/family/{enrollment_id}/messages",
        json={"subject": "Hola", "body": "Mensaje"},
        headers=auth(other_guardian),
    )

    assert (seen.status_code, removed.status_code, written.status_code) == (404, 404, 404)
    still_there = await client.get(f"/classrooms/family/{enrollment_id}", headers=auth(guardian_token))
    assert still_there.status_code == 200


# ---------------------------------------------------------------------------
# HU-49: take the kid out, cancel or clear a request
# ---------------------------------------------------------------------------


async def test_retirar_al_peque_le_avisa_al_docente(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    teacher_token, classroom, guardian_token, kid = await _family(client, identity_gateway)
    enrollment_id = await _ask(client, guardian_token, kid, classroom["enrollment_code"])
    await _answer(client, teacher_token, classroom, enrollment_id, "aceptar")
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("classroom.requests")

    response = await client.delete(f"/classrooms/family/{enrollment_id}", headers=auth(guardian_token))
    event = await _next_event(pubsub)
    members = await client.get(f"/classrooms/{classroom['id']}", headers=auth(teacher_token))

    assert response.status_code == 204
    assert event["event"] == "enrollment.withdrawn"
    assert (event["student_name"], event["guardian_name"]) == ("Sofía", "Ana Pérez")
    assert members.json()["students"] == []
    await pubsub.aclose()


async def test_cancelar_una_pendiente_y_quitar_una_rechazada(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    teacher_token, classroom, guardian_token, kid = await _family(client, identity_gateway)
    other = await _classroom(client, teacher_token, "Ciencias")
    pending_id = await _ask(client, guardian_token, kid, classroom["enrollment_code"])
    rejected_id = await _ask(client, guardian_token, kid, other["enrollment_code"])
    await _answer(client, teacher_token, other, rejected_id, "rechazar")
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("classroom.requests")

    cancelled = await client.delete(f"/classrooms/family/{pending_id}", headers=auth(guardian_token))
    event = await _next_event(pubsub)
    cleared = await client.delete(f"/classrooms/family/{rejected_id}", headers=auth(guardian_token))
    nothing_more = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.2)
    family = await client.get("/classrooms/family", headers=auth(guardian_token))

    assert (cancelled.status_code, cleared.status_code) == (204, 204)
    assert event["event"] == "request.cancelled"
    assert nothing_more is None
    assert family.json() == []
    await pubsub.aclose()


# ---------------------------------------------------------------------------
# HU-48: a message to the teacher
# ---------------------------------------------------------------------------


async def test_el_mensaje_le_llega_al_docente(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    teacher_token, classroom, guardian_token, kid = await _family(client, identity_gateway)
    enrollment_id = await _ask(client, guardian_token, kid, classroom["enrollment_code"])
    await _answer(client, teacher_token, classroom, enrollment_id, "aceptar")
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("classroom.requests")

    response = await client.post(
        f"/classrooms/family/{enrollment_id}/messages",
        json={"subject": "  Tarea de sumas ", "body": "Hola profe,\nSofía no pudo entrar ayer."},
        headers=auth(guardian_token),
    )
    event = await _next_event(pubsub)

    assert response.status_code == 204
    assert event["event"] == "message.sent"
    assert (event["subject"], event["body"]) == ("Tarea de sumas", "Hola profe,\nSofía no pudo entrar ayer.")
    assert (event["guardian_name"], event["student_name"]) == ("Ana Pérez", "Sofía")
    assert event["teacher_id"] == classroom["teacher_id"]
    await pubsub.aclose()


async def test_solo_se_escribe_cuando_el_peque_ya_esta_en_la_clase(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    _teacher, classroom, guardian_token, kid = await _family(client, identity_gateway)
    enrollment_id = await _ask(client, guardian_token, kid, classroom["enrollment_code"])

    response = await client.post(
        f"/classrooms/family/{enrollment_id}/messages",
        json={"subject": "Hola", "body": "Mensaje"},
        headers=auth(guardian_token),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "aun_no_esta_en_la_clase"


@pytest.mark.parametrize(
    "payload",
    [
        {"subject": "", "body": "Mensaje"},
        {"subject": "Hola", "body": "   "},
        {"subject": "x" * 121, "body": "Mensaje"},
        {"subject": "Hola", "body": "x" * 2001},
        {"subject": "Ho\x07la", "body": "Mensaje"},
    ],
)
async def test_un_mensaje_vacio_largo_o_raro_no_sale(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, payload: dict
) -> None:
    teacher_token, classroom, guardian_token, kid = await _family(client, identity_gateway)
    enrollment_id = await _ask(client, guardian_token, kid, classroom["enrollment_code"])
    await _answer(client, teacher_token, classroom, enrollment_id, "aceptar")

    response = await client.post(
        f"/classrooms/family/{enrollment_id}/messages", json=payload, headers=auth(guardian_token)
    )

    assert response.status_code == 422


async def test_si_redis_falla_el_mensaje_no_se_da_por_enviado(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    teacher_token, classroom, guardian_token, kid = await _family(client, identity_gateway)
    enrollment_id = await _ask(client, guardian_token, kid, classroom["enrollment_code"])
    await _answer(client, teacher_token, classroom, enrollment_id, "aceptar")

    async def broken(*_args: object) -> None:
        raise ConnectionError("redis caído")

    redis_client.publish = broken  # type: ignore[method-assign]
    response = await client.post(
        f"/classrooms/family/{enrollment_id}/messages",
        json={"subject": "Hola", "body": "Mensaje"},
        headers=auth(guardian_token),
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "mensaje_no_enviado"


# ---------------------------------------------------------------------------
# The logo, also for the family with the portal open
# ---------------------------------------------------------------------------


async def test_el_tutor_ve_el_logo_solo_con_el_portal_abierto(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, object_storage: FakeObjectStorage
) -> None:
    teacher_token, classroom, guardian_token, _kid = await _family(client, identity_gateway)
    upload = await client.post(
        f"/classrooms/{classroom['id']}/logo",
        headers=auth(teacher_token),
        files={"file": ("logo.png", PNG, "image/png")},
    )
    logo = f"/classrooms/{classroom['id']}/logo/{upload.json()['logo_file']}"

    seen = await client.get(logo, headers=auth(guardian_token))
    identity_gateway.portal_open = False
    closed = await client.get(logo, headers=auth(guardian_token))

    assert seen.status_code == 200 and seen.headers["x-iris-media"].endswith(upload.json()["logo_file"])
    assert closed.status_code == 403


# ---------------------------------------------------------------------------
# HU-46 and HU-47: the kid's progress in the class
# ---------------------------------------------------------------------------

PROGRESS = [
    {
        "lesson_id": "6f1d2c1e-9a4b-4c33-9a57-1d2b3c4d5e6f",
        "title": "Animales terrestres",
        "unit_title": "Los animales",
        "main": {
            "extra_id": None,
            "title": "Animales terrestres",
            "kind": "leccion",
            "total_pages": 2,
            "pages_seen": 1,
            "has_activity": True,
            "attempts": [{"correct": 2, "total": 2, "passed": True, "created_at": "2026-10-08T10:00:00Z"}],
            "percent": 67,
            "something_else": "never reaches the family",
        },
        "extras": [],
    }
]


async def test_el_progreso_del_peque_solo_cuando_ya_esta_en_la_clase(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, content_gateway: FakeContentGateway
) -> None:
    teacher_token, classroom, guardian_token, kid = await _family(client, identity_gateway)
    enrollment_id = await _ask(client, guardian_token, kid, classroom["enrollment_code"])
    content_gateway.progress[(UUID(classroom["id"]), UUID(kid))] = PROGRESS  # type: ignore[assignment]

    while_pending = await client.get(f"/classrooms/family/{enrollment_id}/progress", headers=auth(guardian_token))
    await _answer(client, teacher_token, classroom, enrollment_id, "aceptar")
    inside = await client.get(f"/classrooms/family/{enrollment_id}/progress", headers=auth(guardian_token))
    other_guardian, _ = identity_gateway.registrar_tutor_con_peques()
    someone_else = await client.get(f"/classrooms/family/{enrollment_id}/progress", headers=auth(other_guardian))

    assert while_pending.status_code == 409
    assert inside.status_code == 200, inside.text
    [lesson] = inside.json()
    assert (lesson["title"], lesson["main"]["percent"]) == ("Animales terrestres", 67)
    assert "something_else" not in lesson["main"]
    assert someone_else.status_code == 404


async def test_sin_content_service_el_progreso_avisa(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, content_gateway: FakeContentGateway
) -> None:
    teacher_token, classroom, guardian_token, kid = await _family(client, identity_gateway)
    enrollment_id = await _ask(client, guardian_token, kid, classroom["enrollment_code"])
    await _answer(client, teacher_token, classroom, enrollment_id, "aceptar")
    content_gateway.unavailable = True

    response = await client.get(f"/classrooms/family/{enrollment_id}/progress", headers=auth(guardian_token))

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "progreso_no_disponible"
