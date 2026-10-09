# The session history: each sign-in of a guardian or a teacher is kept in
# the database with its browser and system families, when it was last used
# and how it ended. profile_changes.session_id can be checked against it.

from __future__ import annotations

import pyotp
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.domain.user_agent import describe_user_agent
from app.infrastructure.db import SessionLocal
from app.infrastructure.models import ProfileChangeModel, SessionHistoryModel
from tests.conftest import (
    activar_2fa_docente,
    activar_2fa_y_abrir_portal,
    payload_registro_tutor,
    refresh_cookie,
)

pytestmark = pytest.mark.asyncio

CHROME_WINDOWS = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/141.0.0.0 Safari/537.36"
)
SAFARI_IPHONE = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) "
    "Version/18.0 Mobile/15E148 Safari/604.1"
)
PASSWORD = "Clave-Segura-123"


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _sesiones() -> list[SessionHistoryModel]:
    async with SessionLocal() as session:
        result = await session.execute(select(SessionHistoryModel).order_by(SessionHistoryModel.started_at))
        return list(result.scalars())


async def _login(client: AsyncClient, correo: str, user_agent: str) -> dict:
    respuesta = await client.post(
        "/auth/login", json={"email": correo, "password": PASSWORD}, headers={"User-Agent": user_agent}
    )
    assert respuesta.status_code == 200, respuesta.text
    body: dict = respuesta.json()
    return body


# --- reading the browser ---


@pytest.mark.parametrize(
    ("user_agent", "esperado"),
    [
        (CHROME_WINDOWS, ("Chrome", "Windows")),
        (SAFARI_IPHONE, ("Safari", "iOS")),
        (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
            ("Edge", "Windows"),
        ),
        ("Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0", ("Firefox", "Linux")),
        (
            "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) "
            "SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
            ("Samsung Internet", "Android"),
        ),
        (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) "
            "Version/18.0 Safari/605.1.15",
            ("Safari", "macOS"),
        ),
        ("algo-raro/1.0", ("other", "other")),
        ("", (None, None)),
        (None, (None, None)),
    ],
)
def test_del_navegador_solo_se_saca_la_familia(user_agent: str | None, esperado: tuple) -> None:
    assert describe_user_agent(user_agent) == esperado


# --- starting a session ---


async def test_al_registrarse_y_al_iniciar_sesion_queda_cada_sesion_con_su_navegador(client: AsyncClient) -> None:
    registro = await client.post(
        "/auth/guardians",
        json=payload_registro_tutor("historial@example.com", "7100000001"),
        headers={"User-Agent": CHROME_WINDOWS},
    )
    assert registro.status_code == 201
    await _login(client, "historial@example.com", SAFARI_IPHONE)

    primera, segunda = await _sesiones()
    assert (primera.role, primera.browser, primera.operating_system) == ("guardian", "Chrome", "Windows")
    assert (segunda.browser, segunda.operating_system) == ("Safari", "iOS")
    assert primera.session_id != segunda.session_id
    assert primera.ended_at is None and primera.end_reason is None


async def test_el_texto_completo_del_navegador_nunca_se_guarda(client: AsyncClient) -> None:
    await client.post(
        "/auth/guardians",
        json=payload_registro_tutor("sin-texto@example.com", "7100000002"),
        headers={"User-Agent": CHROME_WINDOWS},
    )

    [sesion] = await _sesiones()
    guardado = {c.name: getattr(sesion, c.name) for c in SessionHistoryModel.__table__.columns}
    assert not any(isinstance(valor, str) and "Mozilla" in valor for valor in guardado.values())


async def test_las_sesiones_de_los_estudiantes_no_se_guardan(client: AsyncClient) -> None:
    registro = await client.post("/auth/guardians", json=payload_registro_tutor("peque-sesion@example.com", "7100000003"))
    token = registro.json()["access_token"]
    await activar_2fa_y_abrir_portal(client, token)
    student_id = (await client.get("/guardians/me/students", headers=_headers(token))).json()[0]["id"]

    peque = await client.post(
        "/auth/students/profile", json={"student_id": student_id, "pin": "1234"}, headers=_headers(token)
    )

    assert peque.status_code == 200
    assert [s.role for s in await _sesiones()] == ["guardian"]


# --- using and ending it ---


async def test_al_renovar_el_token_queda_la_ultima_actividad(client: AsyncClient) -> None:
    await client.post("/auth/guardians", json=payload_registro_tutor("activa@example.com", "7100000004"))

    assert (await client.post("/auth/refresh")).status_code == 200

    [sesion] = await _sesiones()
    assert sesion.last_active_at is not None
    assert sesion.ended_at is None


async def test_cerrar_sesion_la_cierra_con_su_motivo(client: AsyncClient) -> None:
    registro = await client.post("/auth/guardians", json=payload_registro_tutor("cierra@example.com", "7100000005"))

    await client.post("/auth/logout", headers=_headers(registro.json()["access_token"]))

    [sesion] = await _sesiones()
    assert sesion.end_reason == "logout"
    assert sesion.ended_at is not None


async def test_cerrar_todas_cierra_solo_las_abiertas_y_no_cambia_las_ya_cerradas(client: AsyncClient) -> None:
    registro = await client.post("/auth/guardians", json=payload_registro_tutor("todas-h@example.com", "7100000006"))
    await client.post("/auth/logout", headers=_headers(registro.json()["access_token"]))
    segunda = await _login(client, "todas-h@example.com", CHROME_WINDOWS)
    await _login(client, "todas-h@example.com", SAFARI_IPHONE)

    respuesta = await client.post("/auth/logout-all", headers=_headers(segunda["access_token"]))

    assert respuesta.status_code == 204
    motivos = [s.end_reason for s in await _sesiones()]
    assert motivos == ["logout", "user_request", "user_request"]


async def test_cambiar_la_contrasena_cierra_las_sesiones_con_ese_motivo(client: AsyncClient) -> None:
    registro = await client.post(
        "/auth/teachers",
        json={
            "first_name": "Carlos",
            "last_name": "Ruiz",
            "email": "clave-h@example.com",
            "password": PASSWORD,
            "document_type_id": 1,
            "document_number": "71000007",
            "date_of_birth": "1988-06-20",
            "phone_country_code": "57",
            "phone_number": "3009876543",
            "document_issued_at": "2006-07-01",
            "consent": {"policy_version": "1.2", "accepts_data_processing": True},
        },
        headers={"User-Agent": CHROME_WINDOWS},
    )
    secret, token = await activar_2fa_docente(client, registro.json()["access_token"])

    cambio = await client.post(
        "/teachers/me/password",
        json={
            "current_password": PASSWORD,
            "code": pyotp.TOTP(secret).now(),
            "password": "Otra-Clave-456",
            "password_confirmation": "Otra-Clave-456",
        },
        headers=_headers(token),
    )

    assert cambio.status_code == 204, cambio.text
    [sesion] = await _sesiones()
    assert (sesion.role, sesion.browser, sesion.end_reason) == ("teacher", "Chrome", "password_changed")


# --- what it's for ---


async def test_cada_cambio_del_perfil_se_cruza_con_la_sesion_que_lo_hizo(client: AsyncClient) -> None:
    respuesta = await client.post(
        "/auth/guardians",
        json=payload_registro_tutor("cruce@example.com", "7100000008"),
        headers={"User-Agent": SAFARI_IPHONE},
    )
    token = respuesta.json()["access_token"]
    assert refresh_cookie(respuesta)
    await activar_2fa_y_abrir_portal(client, token)
    perfil = (await client.get("/guardians/me", headers=_headers(token))).json()

    cambio = await client.patch(
        "/guardians/me",
        json={
            "first_name": "Lucía",
            "last_name": perfil["last_name"],
            "date_of_birth": perfil["date_of_birth"],
            "phone_country_code": perfil["phone_country_code"],
            "phone_number": perfil["phone_number"],
            "relationship_type_id": perfil["relationship_type_id"],
            "truthful_declaration": True,
        },
        headers=_headers(token),
    )
    assert cambio.status_code == 200, cambio.text

    async with SessionLocal() as session:
        registro_cambio = (await session.execute(select(ProfileChangeModel))).scalar_one()
        sesion = await session.get(SessionHistoryModel, registro_cambio.session_id)
    assert sesion is not None
    assert (sesion.browser, sesion.operating_system) == ("Safari", "iOS")


async def test_al_eliminar_la_cuenta_se_va_su_historial(client: AsyncClient) -> None:
    respuesta = await client.post("/auth/guardians", json=payload_registro_tutor("borra-h@example.com", "7100000009"))
    token = respuesta.json()["access_token"]
    await activar_2fa_y_abrir_portal(client, token)

    deleted = await client.request("DELETE", "/guardians/me", json={"password": "Clave-Segura-123"}, headers=_headers(token))
    assert deleted.status_code == 204

    assert await _sesiones() == []
