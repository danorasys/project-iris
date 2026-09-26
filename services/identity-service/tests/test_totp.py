from __future__ import annotations

import pyotp
import pytest
from httpx import AsyncClient

from app.config import get_settings
from tests.conftest import (
    activar_2fa_y_abrir_portal,
    registrar_tutor as _registrar_y_obtener_token,
    registrar_tutor_con_2fa as _registrar_con_2fa_activo,
)

pytestmark = pytest.mark.asyncio


async def test_setup_totp_devuelve_qr_y_clave_manual(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "totp-setup@example.com", "5000000001")

    respuesta = await client.post("/guardians/me/2fa/setup", headers={"Authorization": f"Bearer {token}"})

    assert respuesta.status_code == 200
    body = respuesta.json()
    assert body["qr_code_data_uri"].startswith("data:image/png;base64,")
    assert len(body["manual_entry_key"]) >= 16


async def test_verify_totp_con_codigo_correcto_activa_2fa(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "totp-ok@example.com", "5000000002")
    setup = await client.post("/guardians/me/2fa/setup", headers={"Authorization": f"Bearer {token}"})
    secret = setup.json()["manual_entry_key"]
    codigo_valido = pyotp.TOTP(secret).now()

    respuesta = await client.post(
        "/guardians/me/2fa/verify",
        json={"code": codigo_valido},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert respuesta.status_code == 204


async def test_verify_totp_con_codigo_incorrecto_es_rechazado(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "totp-malo@example.com", "5000000003")
    await client.post("/guardians/me/2fa/setup", headers={"Authorization": f"Bearer {token}"})

    respuesta = await client.post(
        "/guardians/me/2fa/verify",
        json={"code": "000000"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert respuesta.status_code == 401
    assert respuesta.json()["error"]["code"] == "codigo_totp_invalido"


async def test_verify_totp_sin_haber_hecho_setup_es_rechazado(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "totp-sin-setup@example.com", "5000000004")

    respuesta = await client.post(
        "/guardians/me/2fa/verify",
        json={"code": "123456"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert respuesta.status_code == 422
    assert respuesta.json()["error"]["code"] == "configuracion_totp_no_iniciada"


async def test_setup_totp_requiere_autenticacion(client: AsyncClient) -> None:
    respuesta = await client.post("/guardians/me/2fa/setup")

    assert respuesta.status_code == 401


async def test_verify_totp_codigo_con_formato_invalido_es_rechazado(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "totp-formato@example.com", "5000000005")
    await client.post("/guardians/me/2fa/setup", headers={"Authorization": f"Bearer {token}"})

    respuesta = await client.post(
        "/guardians/me/2fa/verify",
        json={"code": "12a"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert respuesta.status_code == 422
    assert respuesta.json()["error"]["code"] == "datos_invalidos"


async def test_verify_totp_bloqueado_tras_maximo_de_intentos(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "totp-fuerza-bruta@example.com", "5000000006")
    await client.post("/guardians/me/2fa/setup", headers={"Authorization": f"Bearer {token}"})
    maximo = get_settings().rate_limit_totp_max

    ultima_respuesta = None
    for _ in range(maximo + 1):
        ultima_respuesta = await client.post(
            "/guardians/me/2fa/verify",
            json={"code": "000000"},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert ultima_respuesta is not None
    assert ultima_respuesta.status_code == 429
    assert ultima_respuesta.json()["error"]["code"] == "limite_intentos_excedido"
    espera = ultima_respuesta.json()["error"]["details"]["retry_after_seconds"]
    assert 0 < espera <= get_settings().rate_limit_totp_window_sec
    assert ultima_respuesta.headers["Retry-After"] == str(espera)


# --- POST /guardians/me/2fa/challenge (before the parents' portal) ---


async def test_challenge_con_codigo_correcto_es_aceptado(client: AsyncClient) -> None:
    token, secret = await _registrar_con_2fa_activo(client, "portal-ok@example.com", "5100000001")

    respuesta = await client.post(
        "/guardians/me/2fa/challenge",
        json={"code": pyotp.TOTP(secret).now()},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert respuesta.status_code == 200
    assert respuesta.json() == {"failed_attempts_before": 0}


async def test_challenge_no_acepta_el_mismo_codigo_dos_veces(client: AsyncClient) -> None:
    token, secret = await _registrar_con_2fa_activo(client, "portal-repetido@example.com", "5100000002")
    headers = {"Authorization": f"Bearer {token}"}
    codigo = pyotp.TOTP(secret).now()

    primera = await client.post("/guardians/me/2fa/challenge", json={"code": codigo}, headers=headers)
    segunda = await client.post("/guardians/me/2fa/challenge", json={"code": codigo}, headers=headers)

    assert primera.status_code == 200
    assert segunda.status_code == 401
    assert segunda.json()["error"]["code"] == "codigo_totp_invalido"


async def test_challenge_con_codigo_incorrecto_es_rechazado(client: AsyncClient) -> None:
    token, secret = await _registrar_con_2fa_activo(client, "portal-malo@example.com", "5100000003")
    incorrecto = "000000" if pyotp.TOTP(secret).now() != "000000" else "111111"

    respuesta = await client.post(
        "/guardians/me/2fa/challenge", json={"code": incorrecto}, headers={"Authorization": f"Bearer {token}"}
    )

    assert respuesta.status_code == 401
    assert respuesta.json()["error"]["code"] == "codigo_totp_invalido"


async def test_challenge_sin_2fa_activado_es_rechazado(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "portal-sin-2fa@example.com", "5100000004")

    respuesta = await client.post(
        "/guardians/me/2fa/challenge", json={"code": "123456"}, headers={"Authorization": f"Bearer {token}"}
    )

    assert respuesta.status_code == 409
    assert respuesta.json()["error"]["code"] == "totp_no_activado"


async def test_challenge_con_setup_sin_confirmar_es_rechazado(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "portal-setup-a-medias@example.com", "5100000005")
    headers = {"Authorization": f"Bearer {token}"}
    setup = await client.post("/guardians/me/2fa/setup", headers=headers)
    codigo = pyotp.TOTP(setup.json()["manual_entry_key"]).now()

    respuesta = await client.post("/guardians/me/2fa/challenge", json={"code": codigo}, headers=headers)

    assert respuesta.status_code == 409
    assert respuesta.json()["error"]["code"] == "totp_no_activado"


async def test_challenge_requiere_autenticacion(client: AsyncClient) -> None:
    respuesta = await client.post("/guardians/me/2fa/challenge", json={"code": "123456"})

    assert respuesta.status_code == 401


async def test_challenge_codigo_con_formato_invalido_es_rechazado(client: AsyncClient) -> None:
    token, _ = await _registrar_con_2fa_activo(client, "portal-formato@example.com", "5100000006")

    respuesta = await client.post(
        "/guardians/me/2fa/challenge", json={"code": "12a"}, headers={"Authorization": f"Bearer {token}"}
    )

    assert respuesta.status_code == 422
    assert respuesta.json()["error"]["code"] == "datos_invalidos"


async def test_challenge_se_bloquea_al_llegar_al_maximo_de_fallos_con_la_primera_espera(client: AsyncClient) -> None:
    token, secret = await _registrar_con_2fa_activo(client, "portal-fuerza-bruta@example.com", "5100000007")
    incorrecto = "000000" if pyotp.TOTP(secret).now() != "000000" else "111111"
    ajustes = get_settings()

    ultima_respuesta = None
    for _ in range(ajustes.lockout_max_failures):
        ultima_respuesta = await client.post(
            "/guardians/me/2fa/challenge", json={"code": incorrecto}, headers={"Authorization": f"Bearer {token}"}
        )

    assert ultima_respuesta is not None
    assert ultima_respuesta.status_code == 429
    assert ultima_respuesta.json()["error"]["code"] == "limite_intentos_excedido"
    espera = ultima_respuesta.json()["error"]["details"]["retry_after_seconds"]
    assert espera == ajustes.lockout_wait_steps_sec[0]
    assert ultima_respuesta.headers["Retry-After"] == str(espera)


async def test_challenge_bloqueado_rechaza_incluso_el_codigo_correcto(client: AsyncClient) -> None:
    token, secret = await _registrar_con_2fa_activo(client, "portal-bloqueado@example.com", "5100000008")
    headers = {"Authorization": f"Bearer {token}"}
    incorrecto = "000000" if pyotp.TOTP(secret).now() != "000000" else "111111"
    for _ in range(get_settings().lockout_max_failures):
        await client.post("/guardians/me/2fa/challenge", json={"code": incorrecto}, headers=headers)

    respuesta = await client.post("/guardians/me/2fa/challenge", json={"code": pyotp.TOTP(secret).now()}, headers=headers)

    assert respuesta.status_code == 429


async def test_challenge_correcto_reinicia_el_conteo_de_fallos(client: AsyncClient) -> None:
    token, secret = await _registrar_con_2fa_activo(client, "portal-reinicia@example.com", "5100000009")
    headers = {"Authorization": f"Bearer {token}"}
    incorrecto = "000000" if pyotp.TOTP(secret).now() != "000000" else "111111"
    maximo = get_settings().lockout_max_failures

    for _ in range(maximo - 1):
        await client.post("/guardians/me/2fa/challenge", json={"code": incorrecto}, headers=headers)
    bueno = await client.post("/guardians/me/2fa/challenge", json={"code": pyotp.TOTP(secret).now()}, headers=headers)
    for _ in range(maximo - 1):
        despues = await client.post("/guardians/me/2fa/challenge", json={"code": incorrecto}, headers=headers)

    assert bueno.status_code == 200
    assert despues.status_code == 401


# --- The portal is closed on the server until the 2FA check passes ---


async def test_portal_cerrado_hasta_pasar_el_reto_2fa(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "portal-cerrado@example.com", "5200000001")
    headers = {"Authorization": f"Bearer {token}"}

    perfil = await client.get("/guardians/me", headers=headers)
    estado = await client.get("/guardians/me/portal-access", headers=headers)

    assert perfil.status_code == 403
    assert perfil.json()["error"]["code"] == "acceso_portal_requerido"
    assert estado.status_code == 403


async def test_terminar_la_configuracion_2fa_abre_el_portal(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "portal-tras-setup@example.com", "5200000002")
    await activar_2fa_y_abrir_portal(client, token)

    perfil = await client.get("/guardians/me", headers={"Authorization": f"Bearer {token}"})

    assert perfil.status_code == 200


async def test_reto_correcto_abre_el_portal_en_una_sesion_nueva(client: AsyncClient) -> None:
    _, secret = await _registrar_con_2fa_activo(client, "portal-reto@example.com", "5200000003")
    login = await client.post("/auth/login", json={"email": "portal-reto@example.com", "password": "Clave-Segura-123"})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert (await client.get("/guardians/me", headers=headers)).status_code == 403

    reto = await client.post("/guardians/me/2fa/challenge", json={"code": pyotp.TOTP(secret).now()}, headers=headers)

    assert reto.status_code == 200
    assert (await client.get("/guardians/me", headers=headers)).status_code == 200


async def test_iniciar_sesion_de_nuevo_vuelve_a_cerrar_el_portal(client: AsyncClient) -> None:
    token, _ = await _registrar_con_2fa_activo(client, "portal-relogin@example.com", "5200000004")
    assert (await client.get("/guardians/me", headers={"Authorization": f"Bearer {token}"})).status_code == 200

    login = await client.post("/auth/login", json={"email": "portal-relogin@example.com", "password": "Clave-Segura-123"})
    nuevo = login.json()["access_token"]

    assert (await client.get("/guardians/me", headers={"Authorization": f"Bearer {nuevo}"})).status_code == 403


async def test_cerrar_sesion_cierra_el_portal(client: AsyncClient) -> None:
    _, secret = await _registrar_con_2fa_activo(client, "portal-logout@example.com", "5200000005")
    login = await client.post("/auth/login", json={"email": "portal-logout@example.com", "password": "Clave-Segura-123"})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    await client.post("/guardians/me/2fa/challenge", json={"code": pyotp.TOTP(secret).now()}, headers=headers)
    assert (await client.get("/guardians/me", headers=headers)).status_code == 200

    salida = await client.post("/auth/logout", json={"refresh_token": login.json()["refresh_token"]}, headers=headers)

    assert salida.status_code == 204
    # The whole session is dead, not only the portal.
    assert (await client.get("/guardians/me", headers=headers)).status_code == 401


async def test_listar_los_peques_sigue_abierto_sin_el_reto(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "portal-peques@example.com", "5200000006")

    listado = await client.get("/guardians/me/students", headers={"Authorization": f"Bearer {token}"})

    assert listado.status_code == 200

