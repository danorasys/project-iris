from __future__ import annotations

import pyotp
import pytest
from httpx import AsyncClient

from app.config import get_settings
from tests.conftest import AVATAR_ID_VIOLETA, SUPPORT_CONDITION_ID_PREFIERO_NO_ESPECIFICAR

pytestmark = pytest.mark.asyncio


def _payload_registro_tutor(correo: str, document_number: str) -> dict:
    return {
        "guardian": {
            "first_name": "Ana",
            "last_name": "Pérez",
            "document_type_id": 1,
            "document_number": document_number,
            "document_issued_at": "2015-06-01",
            "date_of_birth": "1990-04-12",
            "email": correo,
            "password": "Clave-Segura-123",
            "password_confirmation": "Clave-Segura-123",
            "phone_country_code": "57",
            "phone_number": "3001234567",
            "relationship_type_id": 1,
        },
        "student": {
            "first_name": "Sofía",
            "last_name": "Pérez",
            "date_of_birth": "2018-05-10",
            "avatar_id": AVATAR_ID_VIOLETA,
            "pin": "1234",
            "pin_confirmation": "1234",
            "support_condition_id": SUPPORT_CONDITION_ID_PREFIERO_NO_ESPECIFICAR,
        },
        "consent": {
            "policy_version": "v1",
            "accepts_data_processing": True,
            "authorizes_support_condition": True,
        },
    }


async def _registrar_y_obtener_token(client: AsyncClient, correo: str, document_number: str) -> str:
    respuesta = await client.post("/auth/guardians", json=_payload_registro_tutor(correo, document_number))
    assert respuesta.status_code == 201
    token: str = respuesta.json()["access_token"]
    return token


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
