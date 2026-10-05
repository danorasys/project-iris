# The teacher's 2FA (ADR 0010): set up when the account is created, and asked
# once in every new session before the panel. A session that passed the code
# gets access tokens with the mfa claim, which every service checks.

from __future__ import annotations

import fakeredis.aioredis
import jwt
import pyotp
from httpx import AsyncClient

from app.config import get_settings
from tests.conftest import activar_2fa_docente, refrescar_con, refresh_cookie, registrar_tutor

PASSWORD = "Clave-Segura-123"


async def _registrar_docente(client: AsyncClient, correo: str, document_number: str) -> str:
    response = await client.post(
        "/auth/teachers",
        json={
            "first_name": "Carlos",
            "last_name": "Ruiz",
            "email": correo,
            "password": PASSWORD,
            "institution": "Colegio Nacional",
            "document_type_id": 1,
            "document_number": document_number,
            "date_of_birth": "1988-06-20",
            "phone_country_code": "57",
            "phone_number": "3009876543",
            "document_issued_at": "2006-07-01",
            "consent": {"policy_version": "1.1", "accepts_data_processing": True},
        },
    )
    assert response.status_code == 201, response.text
    token: str = response.json()["access_token"]
    return token


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _claims(token: str) -> dict:
    claims: dict = jwt.decode(token, options={"verify_signature": False})
    return claims


async def _otra_sesion(client: AsyncClient, correo: str):
    client.cookies.clear()
    login = await client.post("/auth/login", json={"email": correo, "password": PASSWORD})
    assert login.status_code == 200
    return login


async def test_un_docente_nuevo_aun_no_tiene_2fa_ni_entra_a_su_panel(client: AsyncClient) -> None:
    token = await _registrar_docente(client, "nuevo-2fa@example.com", "82000001")

    estado = await client.get("/teachers/me/2fa", headers=_auth(token))
    perfil = await client.get("/teachers/me/profile", headers=_auth(token))

    assert estado.json() == {"enabled": False}
    assert "mfa" not in _claims(token)
    assert perfil.status_code == 403
    assert perfil.json()["error"]["code"] == "verificacion_2fa_requerida"


async def test_activarlo_verifica_la_sesion_y_abre_el_panel(client: AsyncClient) -> None:
    token = await _registrar_docente(client, "activar-2fa@example.com", "82000002")

    _secret, verificado = await activar_2fa_docente(client, token)

    assert _claims(verificado)["mfa"] == "1"
    assert _claims(verificado)["sid"] == _claims(token)["sid"]
    assert (await client.get("/teachers/me/profile", headers=_auth(verificado))).status_code == 200
    assert (await client.get("/teachers/me/2fa", headers=_auth(verificado))).json() == {"enabled": True}


async def test_un_codigo_malo_no_lo_activa(client: AsyncClient) -> None:
    token = await _registrar_docente(client, "malo-2fa@example.com", "82000003")
    secret = (await client.post("/teachers/me/2fa/setup", headers=_auth(token))).json()["manual_entry_key"]
    malo = str((int(pyotp.TOTP(secret).now()) + 1) % 1_000_000).zfill(6)

    response = await client.post("/teachers/me/2fa/verify", json={"code": malo}, headers=_auth(token))

    assert response.status_code == 401
    assert (await client.get("/teachers/me/2fa", headers=_auth(token))).json() == {"enabled": False}


async def test_cada_sesion_nueva_pide_el_codigo(client: AsyncClient) -> None:
    correo = "sesion-2fa@example.com"
    secret, _ = await activar_2fa_docente(client, await _registrar_docente(client, correo, "82000004"))

    login = await _otra_sesion(client, correo)
    nuevo = login.json()["access_token"]
    assert "mfa" not in _claims(nuevo)
    assert (await client.get("/teachers/me/profile", headers=_auth(nuevo))).status_code == 403

    # The code of the setup was already used, so the next one the app would
    # show is typed (the server accepts one step of clock drift).
    codigo = pyotp.TOTP(secret).at(int(_claims(nuevo)["iat"]) + 30)
    reto = await client.post("/teachers/me/2fa/challenge", json={"code": codigo}, headers=_auth(nuevo))

    assert reto.status_code == 200
    verificado = reto.json()["access_token"]
    assert _claims(verificado)["mfa"] == "1"
    assert (await client.get("/teachers/me/profile", headers=_auth(verificado))).status_code == 200


async def test_el_mismo_codigo_no_sirve_dos_veces(client: AsyncClient) -> None:
    correo = "repetido-2fa@example.com"
    secret, _ = await activar_2fa_docente(client, await _registrar_docente(client, correo, "82000005"))
    nuevo = (await _otra_sesion(client, correo)).json()["access_token"]
    codigo = pyotp.TOTP(secret).at(int(_claims(nuevo)["iat"]) + 30)

    primero = await client.post("/teachers/me/2fa/challenge", json={"code": codigo}, headers=_auth(nuevo))
    segundo = await client.post("/teachers/me/2fa/challenge", json={"code": codigo}, headers=_auth(nuevo))

    assert primero.status_code == 200
    assert segundo.status_code == 401


async def test_renovar_el_token_mantiene_la_verificacion_de_esa_sesion(client: AsyncClient) -> None:
    correo = "refresh-2fa@example.com"
    token = await _registrar_docente(client, correo, "82000006")
    cookie = client.cookies.get("iris_refresh")
    assert cookie
    await activar_2fa_docente(client, token)

    renovado = await refrescar_con(client, cookie)

    assert renovado.status_code == 200
    assert _claims(renovado.json()["access_token"])["mfa"] == "1"

    # A session that never typed the code doesn't get it when renewing.
    otra = await _otra_sesion(client, correo)
    renovada_sin_codigo = await refrescar_con(client, refresh_cookie(otra))
    assert "mfa" not in _claims(renovada_sin_codigo.json()["access_token"])


async def test_cerrar_sesion_olvida_la_verificacion(
    client: AsyncClient, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    token = await _registrar_docente(client, "logout-2fa@example.com", "82000007")
    cookie = client.cookies.get("iris_refresh")
    _, verificado = await activar_2fa_docente(client, token)
    sid = _claims(verificado)["sid"]
    assert await redis_client.get(f"session-mfa:{sid}") is not None

    client.cookies.set("iris_refresh", cookie, domain="iris.test", path="/auth")
    salida = await client.post("/auth/logout")

    assert salida.status_code == 204
    assert await redis_client.get(f"session-mfa:{sid}") is None


async def test_los_otros_servicios_ven_la_marca_al_validar_el_token(client: AsyncClient) -> None:
    token = await _registrar_docente(client, "interno-2fa@example.com", "82000008")
    _, verificado = await activar_2fa_docente(client, token)
    internal = {"X-Internal-Key": get_settings().internal_service_key}

    sin_codigo = await client.get("/internal/tokens/validate", headers={**_auth(token), **internal})
    con_codigo = await client.get("/internal/tokens/validate", headers={**_auth(verificado), **internal})

    assert "mfa" not in sin_codigo.json()["extra"]
    assert con_codigo.json()["extra"]["mfa"] == "1"


async def test_un_tutor_no_usa_el_2fa_del_docente(client: AsyncClient) -> None:
    tutor = await registrar_tutor(client, "tutor-no-docente@example.com", "82000009")

    assert (await client.get("/teachers/me/2fa", headers=_auth(tutor))).status_code == 403
    assert (await client.post("/teachers/me/2fa/setup", headers=_auth(tutor))).status_code == 403


async def test_con_el_2fa_activo_no_se_puede_cambiar_de_celular_con_solo_la_contrasena(client: AsyncClient) -> None:
    correo = "robo-2fa@example.com"
    await activar_2fa_docente(client, await _registrar_docente(client, correo, "82000010"))
    # Someone with only the password signs in and tries to set it up again.
    intruso = (await _otra_sesion(client, correo)).json()["access_token"]

    setup = await client.post("/teachers/me/2fa/setup", headers=_auth(intruso))
    verify = await client.post("/teachers/me/2fa/verify", json={"code": "123456"}, headers=_auth(intruso))

    assert setup.status_code == 409
    assert setup.json()["error"]["code"] == "totp_ya_activado"
    assert verify.status_code == 409
    assert (await client.get("/teachers/me/2fa", headers=_auth(intruso))).json() == {"enabled": True}
