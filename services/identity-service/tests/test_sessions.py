from __future__ import annotations

import asyncio
import logging
import time

import fakeredis.aioredis
import pyotp
import pytest
from httpx import AsyncClient
import jwt

from app.config import get_settings
from tests.conftest import payload_registro_tutor, registrar_tutor, registrar_tutor_con_2fa

pytestmark = pytest.mark.asyncio


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _claims(token: str) -> dict:
    return jwt.decode(token, options={"verify_signature": False})


async def _login(client: AsyncClient, correo: str, ip: str | None = None) -> dict:
    respuesta = await client.post(
        "/auth/login",
        json={"email": correo, "password": "Clave-Segura-123"},
        headers={"X-Forwarded-For": ip} if ip else {},
    )
    assert respuesta.status_code == 200
    body: dict = respuesta.json()
    return body


def _incorrecto(secret: str) -> str:
    return "000000" if pyotp.TOTP(secret).now() != "000000" else "111111"


async def _fallar_reto(client: AsyncClient, token: str, secret: str, veces: int):
    ultima = None
    for _ in range(veces):
        ultima = await client.post("/guardians/me/2fa/challenge", json={"code": _incorrecto(secret)}, headers=_headers(token))
    assert ultima is not None
    return ultima


async def _fin_de_la_espera(redis: fakeredis.aioredis.FakeRedis, patron: str) -> None:
    async for key in redis.scan_iter(patron):
        await redis.delete(key)


# --- sid in the tokens ---


async def test_los_tokens_llevan_un_sid_que_se_conserva_al_refrescar_y_cambia_en_cada_login(client: AsyncClient) -> None:
    registro = (await client.post("/auth/guardians", json=payload_registro_tutor("sid@example.com", "7000000001"))).json()
    assert _claims(registro["access_token"])["sid"] == _claims(registro["refresh_token"])["sid"]

    refrescado = (await client.post("/auth/refresh", json={"refresh_token": registro["refresh_token"]})).json()
    login = await _login(client, "sid@example.com")

    assert _claims(refrescado["access_token"])["sid"] == _claims(registro["access_token"])["sid"]
    assert _claims(login["access_token"])["sid"] != _claims(registro["access_token"])["sid"]


# --- logout and close all ---


async def test_cerrar_sesion_invalida_el_token_de_acceso_al_instante(client: AsyncClient) -> None:
    registro = (await client.post("/auth/guardians", json=payload_registro_tutor("logout-ya@example.com", "7000000002"))).json()
    assert (await client.get("/users/me", headers=_headers(registro["access_token"]))).status_code == 200

    await client.post("/auth/logout", json={"refresh_token": registro["refresh_token"]}, headers=_headers(registro["access_token"]))

    assert (await client.get("/users/me", headers=_headers(registro["access_token"]))).status_code == 401


async def test_cerrar_todas_las_sesiones_invalida_los_tokens_anteriores_pero_no_los_nuevos(client: AsyncClient) -> None:
    primera = (await client.post("/auth/guardians", json=payload_registro_tutor("todas@example.com", "7000000003"))).json()
    segunda = await _login(client, "todas@example.com")

    respuesta = await client.post("/auth/logout-all", headers=_headers(primera["access_token"]))

    assert respuesta.status_code == 204
    assert (await client.get("/users/me", headers=_headers(primera["access_token"]))).status_code == 401
    assert (await client.get("/users/me", headers=_headers(segunda["access_token"]))).status_code == 401
    refrescar = await client.post("/auth/refresh", json={"refresh_token": segunda["refresh_token"]})
    assert refrescar.status_code == 401
    # Token dates have whole seconds, so a login has to wait for the next second.
    await asyncio.sleep(1.2)
    nueva = await _login(client, "todas@example.com")
    assert (await client.get("/users/me", headers=_headers(nueva["access_token"]))).status_code == 200


async def test_cerrar_todas_las_sesiones_requiere_autenticacion(client: AsyncClient) -> None:
    assert (await client.post("/auth/logout-all")).status_code == 401


async def test_cambiar_la_contrasena_cierra_todas_las_sesiones(client: AsyncClient) -> None:
    token, secret = await registrar_tutor_con_2fa(client, "cambia-clave@example.com", "7000000004")
    otra = await _login(client, "cambia-clave@example.com")
    # A new login closes the portal, so it is opened again for the first session.
    await activar_2fa_y_abrir_portal_con_secreto(client, token, secret)

    cambio = await client.post(
        "/guardians/me/password",
        json={"password": "Otra-Clave-456", "password_confirmation": "Otra-Clave-456"},
        headers=_headers(token),
    )

    assert cambio.status_code == 204
    assert (await client.get("/users/me", headers=_headers(token))).status_code == 401
    assert (await client.get("/users/me", headers=_headers(otra["access_token"]))).status_code == 401


# --- refresh token reuse ---


async def test_reusar_un_refresh_token_mucho_despues_cierra_toda_la_sesion(
    client: AsyncClient, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    registro = (await client.post("/auth/guardians", json=payload_registro_tutor("robo@example.com", "7000000005"))).json()
    usado = registro["refresh_token"]
    nuevo = (await client.post("/auth/refresh", json={"refresh_token": usado})).json()
    # Pretend the first token was used a minute ago, longer than the grace time.
    await redis_client.set(f"blacklist:{_claims(usado)['jti']}", str(time.time() - 60))

    reuso = await client.post("/auth/refresh", json={"refresh_token": usado})

    assert reuso.status_code == 401
    assert (await client.post("/auth/refresh", json={"refresh_token": nuevo["refresh_token"]})).status_code == 401
    assert (await client.get("/users/me", headers=_headers(nuevo["access_token"]))).status_code == 401


async def test_reusar_un_refresh_token_en_el_acto_no_cierra_la_sesion(client: AsyncClient) -> None:
    registro = (await client.post("/auth/guardians", json=payload_registro_tutor("carrera@example.com", "7000000006"))).json()
    usado = registro["refresh_token"]
    nuevo = (await client.post("/auth/refresh", json={"refresh_token": usado})).json()

    reuso = await client.post("/auth/refresh", json={"refresh_token": usado})

    assert reuso.status_code == 401
    assert (await client.post("/auth/refresh", json={"refresh_token": nuevo["refresh_token"]})).status_code == 200


# --- portal 2FA lock per session and per account ---


async def test_el_bloqueo_del_2fa_es_por_sesion_y_no_afecta_a_las_otras(client: AsyncClient) -> None:
    token_a, secret = await registrar_tutor_con_2fa(client, "por-sesion@example.com", "7000000007")
    sesion_b = await _login(client, "por-sesion@example.com")
    await activar_2fa_y_abrir_portal_con_secreto(client, sesion_b["access_token"], secret)

    bloqueada = await _fallar_reto(client, token_a, secret, get_settings().lockout_max_failures)
    otra = await client.post(
        "/guardians/me/2fa/challenge", json={"code": _incorrecto(secret)}, headers=_headers(sesion_b["access_token"])
    )

    assert bloqueada.status_code == 429
    assert otra.status_code == 401
    assert otra.json()["error"]["code"] == "codigo_totp_invalido"


async def activar_2fa_y_abrir_portal_con_secreto(client: AsyncClient, token: str, secret: str) -> None:
    respuesta = await client.post(
        "/guardians/me/2fa/challenge", json={"code": pyotp.TOTP(secret).at(time.time() + 30)}, headers=_headers(token)
    )
    assert respuesta.status_code == 200


async def test_la_segunda_ronda_de_bloqueo_cierra_la_sesion_por_seguridad(
    client: AsyncClient, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    token, secret = await registrar_tutor_con_2fa(client, "segunda-ronda@example.com", "7000000008")
    maximo = get_settings().lockout_max_failures
    assert (await _fallar_reto(client, token, secret, maximo)).status_code == 429
    await _fin_de_la_espera(redis_client, "lockout:portal-2fa:*:until")

    cierre = await _fallar_reto(client, token, secret, maximo)

    assert cierre.status_code == 401
    assert cierre.json()["error"]["code"] == "sesion_cerrada_por_seguridad"
    assert (await client.get("/users/me", headers=_headers(token))).status_code == 401


async def test_el_tope_por_cuenta_suma_los_fallos_de_todas_las_sesiones(client: AsyncClient) -> None:
    ajustes = get_settings()
    _, secret = await registrar_tutor_con_2fa(client, "tope-cuenta@example.com", "7000000009")
    por_sesion = ajustes.lockout_max_failures - 1
    restantes = ajustes.account_lockout_max_failures

    # Each session stays under its own limit, only the sum reaches the account cap.
    ultima = None
    while restantes > 0:
        intentos = min(por_sesion, restantes)
        nueva = await _login(client, "tope-cuenta@example.com")
        ultima = await _fallar_reto(client, nueva["access_token"], secret, intentos)
        restantes -= intentos
        if restantes > 0:
            assert ultima.status_code == 401
    assert ultima is not None

    fresca = await _login(client, "tope-cuenta@example.com")
    correcto = await client.post(
        "/guardians/me/2fa/challenge", json={"code": pyotp.TOTP(secret).now()}, headers=_headers(fresca["access_token"])
    )
    assert ultima.status_code == 429
    assert ultima.json()["error"]["details"]["retry_after_seconds"] == ajustes.account_lockout_wait_sec
    assert correcto.status_code == 429


async def test_el_reto_avisa_de_los_intentos_fallidos_desde_la_ultima_entrada(client: AsyncClient) -> None:
    token, secret = await registrar_tutor_con_2fa(client, "aviso@example.com", "7000000010")
    await _fallar_reto(client, token, secret, 2)

    primero = await client.post(
        "/guardians/me/2fa/challenge", json={"code": pyotp.TOTP(secret).now()}, headers=_headers(token)
    )
    segundo = await client.post(
        "/guardians/me/2fa/challenge", json={"code": pyotp.TOTP(secret).at(time.time() + 30)}, headers=_headers(token)
    )

    assert primero.json() == {"failed_attempts_before": 2}
    assert segundo.json() == {"failed_attempts_before": 0}


# --- login locks ---


async def test_el_login_se_bloquea_por_correo_aunque_los_intentos_vengan_de_muchas_ips(client: AsyncClient) -> None:
    ajustes = get_settings()
    await registrar_tutor(client, "muchas-ips@example.com", "7000000011")
    por_ip = ajustes.lockout_max_failures - 1
    ips = ajustes.account_lockout_max_failures // por_ip + 1

    ultima = None
    for numero in range(ips):
        for _ in range(por_ip):
            ultima = await client.post(
                "/auth/login",
                json={"email": "muchas-ips@example.com", "password": "mala"},
                headers={"X-Forwarded-For": f"10.0.0.{numero}"},
            )

    correcta_desde_otra_ip = await client.post(
        "/auth/login",
        json={"email": "muchas-ips@example.com", "password": "Clave-Segura-123"},
        headers={"X-Forwarded-For": "10.9.9.9"},
    )
    assert ultima is not None
    assert correcta_desde_otra_ip.status_code == 429


async def test_las_claves_de_bloqueo_no_guardan_el_correo_ni_la_ip(
    client: AsyncClient, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    for _ in range(get_settings().lockout_max_failures):
        await client.post(
            "/auth/login",
            json={"email": "privado@example.com", "password": "mala"},
            headers={"X-Forwarded-For": "203.0.113.77"},
        )

    claves = [key async for key in redis_client.scan_iter("*")]

    assert claves
    assert not any("privado" in key or "example.com" in key or "203.0.113.77" in key for key in claves)


async def test_el_pin_se_bloquea_con_esperas_cortas_y_progresivas(
    client: AsyncClient, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    ajustes = get_settings()
    token = await registrar_tutor(client, "pin-progresivo@example.com", "7000000012")
    student_id = (await client.get("/guardians/me/students", headers=_headers(token))).json()[0]["id"]

    async def fallar() -> int:
        respuesta = None
        for _ in range(ajustes.pin_lockout_max_failures):
            respuesta = await client.post("/auth/students/profile", json={"student_id": student_id, "pin": "9999"})
        assert respuesta is not None
        assert respuesta.status_code == 429
        espera: int = respuesta.json()["error"]["details"]["retry_after_seconds"]
        return espera

    primera = await fallar()
    await _fin_de_la_espera(redis_client, "lockout:pin:*:until")
    segunda = await fallar()

    assert primera == ajustes.pin_lockout_wait_steps_sec[0]
    assert segunda == ajustes.pin_lockout_wait_steps_sec[1]


# --- security log ---


async def test_los_bloqueos_se_registran_en_el_log_de_seguridad_sin_datos_personales(
    client: AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING, logger="iris.security"):
        for _ in range(get_settings().lockout_max_failures):
            await client.post("/auth/login", json={"email": "log-seguridad@example.com", "password": "mala"})

    mensajes = [registro.getMessage() for registro in caplog.records if registro.name == "iris.security"]

    assert any("security_event=login_locked" in mensaje for mensaje in mensajes)
    assert not any("log-seguridad" in mensaje or "example.com" in mensaje for mensaje in mensajes)
