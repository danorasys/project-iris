# REST contract of the notification tray: a teacher or a guardian only ever
# sees, reads or deletes their own, and a guardian needs the portal open.

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from app.application.notification_service import NotificationService
from app.infrastructure.uow import SqlAlchemyUnitOfWork
from tests.conftest import FakeIdentityClient


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _record(event: str = "request.created", **extra: object) -> None:
    payload: dict[str, object] = {
        "event": event,
        "classroom_id": str(uuid.uuid4()),
        "enrollment_id": str(uuid.uuid4()),
        "teacher_id": str(uuid.uuid4()),
        "student_name": "Sofía",
    }
    if event == "request.resolved":
        payload["decision"] = "aceptada"
    await NotificationService(uow_factory=SqlAlchemyUnitOfWork).record_event(payload | extra)


def _guardian(identity: FakeIdentityClient, *, portal_open: bool = True) -> tuple[str, str]:
    guardian_id = str(uuid.uuid4())
    identity.register("token-tutor", sub=guardian_id, role="guardian", session_id="sesion-1")
    if portal_open:
        identity.open_portals.add((guardian_id, "sesion-1"))
    return guardian_id, "token-tutor"


# --- teacher ---


async def test_list_requires_authentication(client: AsyncClient) -> None:
    response = await client.get("/notifications/me")

    assert response.status_code == 401


async def test_a_kid_has_their_own_tray(client: AsyncClient, fake_identity_client: FakeIdentityClient) -> None:
    kid_id = str(uuid.uuid4())
    fake_identity_client.register("token-estudiante", sub=kid_id, role="student")
    await _record(
        "teacher.message", recipient="student", student_id=kid_id, subject="Hola", body="¡Bienvenida!"
    )
    # A notification for the teacher about that same kid isn't theirs.
    await _record(student_id=kid_id)

    response = await client.get("/notifications/me", headers=_auth("token-estudiante"))

    assert response.status_code == 200
    assert [n["event"] for n in response.json()["items"]] == ["teacher.message"]


async def test_a_teacher_only_sees_their_own(client: AsyncClient, fake_identity_client: FakeIdentityClient) -> None:
    teacher_id = str(uuid.uuid4())
    fake_identity_client.register("token-docente", sub=teacher_id, role="teacher")
    await _record(teacher_id=teacher_id)
    await _record()

    response = await client.get("/notifications/me", headers=_auth("token-docente"))

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["unread_count"] == 1
    assert body["items"][0]["student_name"] == "Sofía"
    assert body["items"][0]["read"] is False
    # A teacher never needs the portal's 2FA.
    assert fake_identity_client.portal_checks == []


async def test_mark_as_read_updates_the_flag(client: AsyncClient, fake_identity_client: FakeIdentityClient) -> None:
    teacher_id = str(uuid.uuid4())
    fake_identity_client.register("token-docente", sub=teacher_id, role="teacher")
    await _record(teacher_id=teacher_id)
    notification_id = (await client.get("/notifications/me", headers=_auth("token-docente"))).json()["items"][0]["id"]

    response = await client.patch(f"/notifications/{notification_id}/read", headers=_auth("token-docente"))

    assert response.status_code == 200
    assert response.json()["read"] is True
    listed = (await client.get("/notifications/me", headers=_auth("token-docente"))).json()
    assert listed["unread_count"] == 0


async def test_someone_elses_notification_answers_as_if_it_did_not_exist(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    owner_id = str(uuid.uuid4())
    fake_identity_client.register("token-dueno", sub=owner_id, role="teacher")
    fake_identity_client.register("token-otro", sub=str(uuid.uuid4()), role="teacher")
    await _record(teacher_id=owner_id)
    notification_id = (await client.get("/notifications/me", headers=_auth("token-dueno"))).json()["items"][0]["id"]

    read = await client.patch(f"/notifications/{notification_id}/read", headers=_auth("token-otro"))
    deleted = await client.delete(f"/notifications/{notification_id}", headers=_auth("token-otro"))
    unknown = await client.patch(f"/notifications/{uuid.uuid4()}/read", headers=_auth("token-dueno"))

    assert read.status_code == 404
    assert deleted.status_code == 404
    assert unknown.status_code == 404
    still_there = (await client.get("/notifications/me", headers=_auth("token-dueno"))).json()
    assert still_there["total"] == 1


# --- guardian ---


async def test_the_guardian_gets_their_own_with_the_kid_the_classroom_and_the_sender(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    guardian_id, token = _guardian(fake_identity_client)
    student_id = str(uuid.uuid4())
    common = {"guardian_id": guardian_id, "student_id": student_id, "classroom_name": "Matemáticas 3A"}
    # The guardian sent the request themselves (EP-07), so only the answer reaches them.
    await _record("request.created", **common)
    await _record("request.resolved", teacher_name="Carlos Ruiz", **common)

    response = await client.get("/notifications/me", headers=_auth(token))

    assert response.status_code == 200
    [resolved] = response.json()["items"]
    assert resolved["event"] == "request.resolved"
    assert resolved["decision"] == "aceptada"
    assert resolved["sender_name"] == "Carlos Ruiz"
    assert resolved["student_id"] == student_id
    assert resolved["student_name"] == "Sofía"
    assert resolved["classroom_name"] == "Matemáticas 3A"
    # Reading the tray doesn't keep the portal open.
    assert fake_identity_client.portal_checks == [False]


async def test_a_new_request_reaches_the_teacher_from_the_guardian(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    teacher_id = str(uuid.uuid4())
    fake_identity_client.register("token-docente", sub=teacher_id, role="teacher")
    await _record("request.created", teacher_id=teacher_id, guardian_id=str(uuid.uuid4()), guardian_name="Ana Pérez")

    [item] = (await client.get("/notifications/me", headers=_auth("token-docente"))).json()["items"]

    assert item["sender_name"] == "Ana Pérez"
    assert item["student_name"] == "Sofía"


async def test_the_teacher_copy_of_an_answer_arrives_already_read(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    teacher_id = str(uuid.uuid4())
    fake_identity_client.register("token-docente", sub=teacher_id, role="teacher")
    await _record("request.resolved", teacher_id=teacher_id)

    tray = (await client.get("/notifications/me", headers=_auth("token-docente"))).json()

    assert tray["total"] == 1
    assert tray["items"][0]["read"] is True
    assert tray["unread_count"] == 0


async def test_taking_a_kid_out_only_reaches_their_guardian(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    teacher_id = str(uuid.uuid4())
    fake_identity_client.register("token-docente", sub=teacher_id, role="teacher")
    guardian_id, token = _guardian(fake_identity_client)
    await _record(
        "enrollment.removed",
        teacher_id=teacher_id,
        guardian_id=guardian_id,
        teacher_name="Carlos Ruiz",
        classroom_name="Matemáticas 3A",
    )

    guardian_tray = (await client.get("/notifications/me", headers=_auth(token))).json()
    teacher_tray = (await client.get("/notifications/me", headers=_auth("token-docente"))).json()

    [item] = guardian_tray["items"]
    assert item["event"] == "enrollment.removed"
    assert item["sender_name"] == "Carlos Ruiz"
    assert item["classroom_name"] == "Matemáticas 3A"
    assert teacher_tray["total"] == 0


# What a family does from the portal only reaches the teacher, with who did
# it, and a message keeps its subject and body (HU-48, HU-49).
@pytest.mark.parametrize("event", ["request.cancelled", "enrollment.withdrawn", "message.sent"])
async def test_what_a_family_does_only_reaches_the_teacher(
    client: AsyncClient, fake_identity_client: FakeIdentityClient, event: str
) -> None:
    teacher_id = str(uuid.uuid4())
    fake_identity_client.register("token-docente", sub=teacher_id, role="teacher")
    guardian_id, token = _guardian(fake_identity_client)
    await _record(
        event,
        teacher_id=teacher_id,
        guardian_id=guardian_id,
        guardian_name="Ana Pérez",
        subject="Tarea de sumas",
        body="Hola profe,\nSofía no pudo entrar ayer.",
    )

    teacher_tray = (await client.get("/notifications/me", headers=_auth("token-docente"))).json()
    guardian_tray = (await client.get("/notifications/me", headers=_auth(token))).json()

    [item] = teacher_tray["items"]
    assert (item["event"], item["sender_name"], item["read"]) == (event, "Ana Pérez", False)
    if event == "message.sent":
        assert (item["subject"], item["body"]) == ("Tarea de sumas", "Hola profe,\nSofía no pudo entrar ayer.")
        # The guardian keeps a copy of what they wrote, already read (HU-51).
        [copy] = guardian_tray["items"]
        assert (copy["read"], copy["addressee"], copy["thread_id"]) == (True, "teacher", item["thread_id"])
    else:
        assert item["subject"] is None and item["body"] is None
        assert guardian_tray["total"] == 0


async def test_a_long_message_is_cut_to_its_column(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    teacher_id = str(uuid.uuid4())
    fake_identity_client.register("token-docente", sub=teacher_id, role="teacher")
    await _record("message.sent", teacher_id=teacher_id, subject="s" * 500, body="b" * 5000)

    [item] = (await client.get("/notifications/me", headers=_auth("token-docente"))).json()["items"]

    assert (len(item["subject"]), len(item["body"])) == (120, 2000)


# HU-42: the space of one class shows only the notifications of that class
# and that kid, with its own unread count.
async def test_the_tray_of_one_class_and_kid(client: AsyncClient, fake_identity_client: FakeIdentityClient) -> None:
    guardian_id, token = _guardian(fake_identity_client)
    classroom, kid = str(uuid.uuid4()), str(uuid.uuid4())
    await _record("request.resolved", guardian_id=guardian_id, classroom_id=classroom, student_id=kid)
    await _record("enrollment.removed", guardian_id=guardian_id, classroom_id=classroom, student_id=kid)
    await _record("request.resolved", guardian_id=guardian_id, classroom_id=classroom, student_id=str(uuid.uuid4()))
    await _record("request.resolved", guardian_id=guardian_id, student_id=kid)

    response = await client.get(
        "/notifications/me", params={"classroom_id": classroom, "student_id": kid}, headers=_auth(token)
    )
    everything = (await client.get("/notifications/me", headers=_auth(token))).json()

    body = response.json()
    assert [item["event"] for item in body["items"]] == ["enrollment.removed", "request.resolved"]
    assert (body["total"], body["unread_count"]) == (2, 2)
    assert everything["total"] == 4


async def test_an_event_without_a_guardian_only_reaches_the_teacher(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    _guardian_id, token = _guardian(fake_identity_client)
    await _record("request.resolved")

    response = await client.get("/notifications/me", headers=_auth(token))

    assert response.json()["total"] == 0


async def test_the_guardian_needs_the_portal_open(client: AsyncClient, fake_identity_client: FakeIdentityClient) -> None:
    guardian_id, token = _guardian(fake_identity_client, portal_open=False)
    await _record("request.resolved", guardian_id=guardian_id)

    response = await client.get("/notifications/me", headers=_auth(token))

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "acceso_portal_requerido"


async def test_reading_and_deleting_count_as_using_the_portal(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    guardian_id, token = _guardian(fake_identity_client)
    await _record("request.resolved", guardian_id=guardian_id)
    await _record("request.resolved", guardian_id=guardian_id)
    first, second = (await client.get("/notifications/me", headers=_auth(token))).json()["items"]

    read = await client.patch(f"/notifications/{first['id']}/read", headers=_auth(token))
    deleted = await client.delete(f"/notifications/{second['id']}", headers=_auth(token))

    assert read.status_code == 200
    assert deleted.status_code == 204
    after = (await client.get("/notifications/me", headers=_auth(token))).json()
    assert [item["id"] for item in after["items"]] == [first["id"]]
    assert after["unread_count"] == 0
    assert fake_identity_client.portal_checks == [False, True, True, False]


async def test_deletes_several_at_once_only_the_own_ones(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    guardian_id, token = _guardian(fake_identity_client)
    other_id, other_token = str(uuid.uuid4()), "token-otro-tutor"
    fake_identity_client.register(other_token, sub=other_id, role="guardian", session_id="sesion-2")
    fake_identity_client.open_portals.add((other_id, "sesion-2"))
    for _ in range(3):
        await _record("request.resolved", guardian_id=guardian_id)
    await _record("request.resolved", guardian_id=other_id)
    mine = [item["id"] for item in (await client.get("/notifications/me", headers=_auth(token))).json()["items"]]
    theirs = (await client.get("/notifications/me", headers=_auth(other_token))).json()["items"][0]["id"]

    response = await client.post(
        "/notifications/me/delete",
        json={"ids": [mine[0], mine[1], mine[1], theirs, str(uuid.uuid4())]},
        headers=_auth(token),
    )

    assert response.status_code == 200
    # Two of mine; the repeated one counts once, the other's and the unknown are left out.
    assert response.json() == {"deleted": 2}
    left = (await client.get("/notifications/me", headers=_auth(token))).json()
    assert [item["id"] for item in left["items"]] == [mine[2]]
    assert (await client.get("/notifications/me", headers=_auth(other_token))).json()["total"] == 1


async def test_deleting_several_needs_some_ids_and_not_too_many(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    _guardian_id, token = _guardian(fake_identity_client)

    empty = await client.post("/notifications/me/delete", json={"ids": []}, headers=_auth(token))
    too_many = await client.post(
        "/notifications/me/delete", json={"ids": [str(uuid.uuid4()) for _ in range(51)]}, headers=_auth(token)
    )

    assert empty.status_code == 422
    assert too_many.status_code == 422


async def test_deleting_several_needs_the_portal_open(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    guardian_id, token = _guardian(fake_identity_client, portal_open=False)
    await _record("request.resolved", guardian_id=guardian_id)

    response = await client.post("/notifications/me/delete", json={"ids": [str(uuid.uuid4())]}, headers=_auth(token))

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "acceso_portal_requerido"


async def test_a_guardian_cannot_touch_the_teacher_copy_of_the_same_event(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    teacher_id = str(uuid.uuid4())
    fake_identity_client.register("token-docente", sub=teacher_id, role="teacher")
    guardian_id, token = _guardian(fake_identity_client)
    await _record(teacher_id=teacher_id, guardian_id=guardian_id)
    teacher_copy = (await client.get("/notifications/me", headers=_auth("token-docente"))).json()["items"][0]

    response = await client.delete(f"/notifications/{teacher_copy['id']}", headers=_auth(token))

    assert response.status_code == 404


async def test_the_tray_comes_in_pages_newest_first(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    guardian_id, token = _guardian(fake_identity_client)
    for _ in range(5):
        await _record("request.resolved", guardian_id=guardian_id)

    first = (await client.get("/notifications/me?page=1&page_size=2", headers=_auth(token))).json()
    last = (await client.get("/notifications/me?page=3&page_size=2", headers=_auth(token))).json()
    too_big = await client.get("/notifications/me?page_size=51", headers=_auth(token))

    assert first["total"] == 5
    assert len(first["items"]) == 2
    assert first["items"][0]["created_at"] >= first["items"][1]["created_at"]
    assert len(last["items"]) == 1
    assert (last["page"], last["page_size"]) == (3, 2)
    assert too_big.status_code == 422


async def test_a_teacher_without_the_2fa_code_has_no_tray(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    fake_identity_client.register("token-docente", sub=str(uuid.uuid4()), mfa_verified=False)

    response = await client.get("/notifications/me", headers=_auth("token-docente"))

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "verificacion_2fa_requerida"


# Reading the tray every so often doesn't keep a teacher's panel open.
async def test_lo_que_la_pagina_pide_sola_no_cuenta_como_actividad(
    client: AsyncClient, fake_identity_client: FakeIdentityClient
) -> None:
    fake_identity_client.register("token-docente", sub=str(uuid.uuid4()), role="teacher")

    await client.get("/notifications/me", headers=_auth("token-docente"))
    await client.get("/notifications/me", headers={**_auth("token-docente"), "X-Iris-Activity": "background"})

    assert fake_identity_client.renews == [True, False]
