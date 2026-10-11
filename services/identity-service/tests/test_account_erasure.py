# Deleting an account for good (HU-91, HU-92): the password and a fresh 2FA
# code are asked again, the other services erase their part first, and only
# then the account goes. If one of them doesn't answer, nothing is deleted here.

from __future__ import annotations

import pyotp
import pytest
from httpx import AsyncClient

from tests.conftest import activar_2fa_docente, activar_2fa_y_abrir_portal, payload_registro_tutor
from tests.fakes import FakeAccountErasure
from tests.test_auth import _payload_registro_docente

pytestmark = pytest.mark.asyncio

PASSWORD = "Clave-Segura-123"


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _guardian(client: AsyncClient, email: str, document: str) -> tuple[str, list[str], str]:
    registered = await client.post("/auth/guardians", json=payload_registro_tutor(email, document))
    token: str = registered.json()["access_token"]
    secret = await activar_2fa_y_abrir_portal(client, token)
    kids = [k["id"] for k in (await client.get("/guardians/me/students", headers=_auth(token))).json()]
    return token, kids, secret


def _body(secret: str, password: str = PASSWORD, code: str | None = None) -> dict[str, str]:
    return {"password": password, "code": code if code is not None else pyotp.TOTP(secret).now()}


def _wrong_code(secret: str) -> str:
    return "000000" if pyotp.TOTP(secret).now() != "000000" else "111111"


async def _delete(
    client: AsyncClient, path: str, token: str, secret: str, password: str = PASSWORD, code: str | None = None
) -> int:
    response = await client.request("DELETE", path, json=_body(secret, password, code), headers=_auth(token))
    return response.status_code


async def _login(client: AsyncClient, email: str) -> int:
    return (await client.post("/auth/login", json={"email": email, "password": PASSWORD})).status_code


# --- HU-91 ---------------------------------------------------------------------


async def test_borrar_la_cuenta_del_tutor_borra_tambien_en_los_otros_servicios(
    client: AsyncClient, account_erasure: FakeAccountErasure
) -> None:
    token, kids, secret = await _guardian(client, "borra-todo@example.com", "9100000001")
    me = (await client.get("/users/me", headers=_auth(token))).json()

    assert await _delete(client, "/guardians/me", token, secret) == 204

    assert account_erasure.calls == [("students", sorted(kids)), ("notifications", ([me["id"]], sorted(kids)))]
    assert await _login(client, "borra-todo@example.com") == 401


async def test_con_la_contrasena_equivocada_no_se_borra_nada(
    client: AsyncClient, account_erasure: FakeAccountErasure
) -> None:
    token, _, secret = await _guardian(client, "borra-mal@example.com", "9100000002")

    status = await _delete(client, "/guardians/me", token, secret, password="otra-clave")

    # The same answer as changing the password with the wrong current one.
    assert status == 422
    assert account_erasure.calls == []
    assert await _login(client, "borra-mal@example.com") == 200


async def test_sin_el_codigo_de_la_app_no_se_borra_nada(
    client: AsyncClient, account_erasure: FakeAccountErasure
) -> None:
    token, _, secret = await _guardian(client, "borra-sin-codigo@example.com", "9100000004")

    missing = await client.request("DELETE", "/guardians/me", json={"password": PASSWORD}, headers=_auth(token))
    wrong = await client.request(
        "DELETE", "/guardians/me", json=_body(secret, code=_wrong_code(secret)), headers=_auth(token)
    )

    assert missing.status_code == 422
    assert wrong.status_code == 401
    assert wrong.json()["error"]["code"] == "codigo_totp_invalido"
    assert account_erasure.calls == []
    assert await _login(client, "borra-sin-codigo@example.com") == 200


async def test_si_otro_servicio_no_responde_la_cuenta_sigue(
    client: AsyncClient, account_erasure: FakeAccountErasure
) -> None:
    token, _, secret = await _guardian(client, "borra-caido@example.com", "9100000003")
    account_erasure.available = False

    response = await client.request("DELETE", "/guardians/me", json=_body(secret), headers=_auth(token))

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "borrado_no_disponible"
    assert await _login(client, "borra-caido@example.com") == 200


# --- HU-92 ---------------------------------------------------------------------


async def test_borrar_la_cuenta_del_docente_deja_sus_clases_sin_docente(
    client: AsyncClient, account_erasure: FakeAccountErasure
) -> None:
    registered = await client.post("/auth/teachers", json=_payload_registro_docente("docente-borra@example.com", "8100000001"))
    secret, token = await activar_2fa_docente(client, registered.json()["access_token"])
    me = (await client.get("/users/me", headers=_auth(token))).json()

    assert await _delete(client, "/teachers/me", token, secret) == 204

    assert account_erasure.calls == [("teacher_left", me["id"]), ("notifications", ([me["id"]], []))]
    assert await _login(client, "docente-borra@example.com") == 401


async def test_el_docente_necesita_su_sesion_verificada_para_borrar(
    client: AsyncClient, account_erasure: FakeAccountErasure
) -> None:
    registered = await client.post("/auth/teachers", json=_payload_registro_docente("docente-sin-2fa@example.com", "8100000002"))

    status = await _delete(client, "/teachers/me", registered.json()["access_token"], pyotp.random_base32())

    assert status == 403
    assert account_erasure.calls == []
