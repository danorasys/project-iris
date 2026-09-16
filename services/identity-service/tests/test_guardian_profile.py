from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.config import get_settings
from tests.conftest import AVATAR_ID_VIOLETA, SUPPORT_CONDITION_ID_PREFIERO_NO_ESPECIFICAR

pytestmark = pytest.mark.asyncio

_PASSWORD_REGISTRO = "Clave-Segura-123"


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
            "password": _PASSWORD_REGISTRO,
            "password_confirmation": _PASSWORD_REGISTRO,
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


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# --- GET /guardians/me ---


async def test_get_perfil_devuelve_mis_datos(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "perfil-get@example.com", "6000000001")

    respuesta = await client.get("/guardians/me", headers=_headers(token))

    assert respuesta.status_code == 200
    body = respuesta.json()
    assert body["first_name"] == "Ana"
    assert body["last_name"] == "Pérez"
    assert body["email"] == "perfil-get@example.com"
    assert body["document_number"] == "6000000001"
    assert body["relationship_type_id"] == 1


async def test_get_perfil_requiere_autenticacion(client: AsyncClient) -> None:
    respuesta = await client.get("/guardians/me")

    assert respuesta.status_code == 401


# --- PATCH /guardians/me ---


async def test_actualizar_perfil_aplica_los_cambios(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "perfil-patch@example.com", "6000000002")

    respuesta = await client.patch(
        "/guardians/me",
        json={
            "first_name": "Ana María",
            "last_name": "Gómez",
            "date_of_birth": "1990-04-12",
            "phone_country_code": "57",
            "phone_number": "3009998877",
            "relationship_type_id": 2,
        },
        headers=_headers(token),
    )

    assert respuesta.status_code == 200
    body = respuesta.json()
    assert body["first_name"] == "Ana María"
    assert body["last_name"] == "Gómez"
    assert body["phone_number"] == "3009998877"
    assert body["relationship_type_id"] == 2
    # Read-only fields never change through this endpoint.
    assert body["email"] == "perfil-patch@example.com"
    assert body["document_number"] == "6000000002"

    # And the change actually persisted, not just echoed back.
    relectura = await client.get("/guardians/me", headers=_headers(token))
    assert relectura.json()["first_name"] == "Ana María"


async def test_actualizar_perfil_con_tipo_de_relacion_invalido_es_rechazado(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "perfil-relacion-invalida@example.com", "6000000003")

    respuesta = await client.patch(
        "/guardians/me",
        json={
            "first_name": "Ana",
            "last_name": "Pérez",
            "date_of_birth": "1990-04-12",
            "phone_country_code": "57",
            "phone_number": "3001234567",
            "relationship_type_id": 999999,
        },
        headers=_headers(token),
    )

    assert respuesta.status_code == 422
    assert respuesta.json()["error"]["code"] == "tipo_relacion_invalido"


async def test_actualizar_perfil_con_menor_de_edad_es_rechazado(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "perfil-menor@example.com", "6000000004")

    respuesta = await client.patch(
        "/guardians/me",
        json={
            "first_name": "Ana",
            "last_name": "Pérez",
            "date_of_birth": "2020-01-01",
            "phone_country_code": "57",
            "phone_number": "3001234567",
            "relationship_type_id": 1,
        },
        headers=_headers(token),
    )

    assert respuesta.status_code == 422
    assert respuesta.json()["error"]["code"] == "datos_invalidos"


async def test_actualizar_perfil_requiere_autenticacion(client: AsyncClient) -> None:
    respuesta = await client.patch(
        "/guardians/me",
        json={
            "first_name": "Ana",
            "last_name": "Pérez",
            "date_of_birth": "1990-04-12",
            "phone_country_code": "57",
            "phone_number": "3001234567",
            "relationship_type_id": 1,
        },
    )

    assert respuesta.status_code == 401


# --- POST /guardians/me/password ---


async def test_cambiar_password_permite_iniciar_sesion_con_la_nueva(client: AsyncClient) -> None:
    correo = "password-cambio@example.com"
    token = await _registrar_y_obtener_token(client, correo, "6000000005")
    nueva_password = "Otra-Clave-456"

    respuesta = await client.post(
        "/guardians/me/password",
        json={"password": nueva_password, "password_confirmation": nueva_password},
        headers=_headers(token),
    )

    assert respuesta.status_code == 204

    login_con_password_vieja = await client.post(
        "/auth/login", json={"email": correo, "password": _PASSWORD_REGISTRO}
    )
    assert login_con_password_vieja.status_code == 401

    login_con_password_nueva = await client.post("/auth/login", json={"email": correo, "password": nueva_password})
    assert login_con_password_nueva.status_code == 200


async def test_cambiar_password_con_confirmacion_distinta_es_rechazado(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "password-no-coincide@example.com", "6000000006")

    respuesta = await client.post(
        "/guardians/me/password",
        json={"password": "Otra-Clave-456", "password_confirmation": "Otra-Clave-Distinta-789"},
        headers=_headers(token),
    )

    assert respuesta.status_code == 422
    assert respuesta.json()["error"]["code"] == "datos_invalidos"


async def test_cambiar_password_debil_es_rechazado(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "password-debil@example.com", "6000000007")

    respuesta = await client.post(
        "/guardians/me/password",
        json={"password": "debilita", "password_confirmation": "debilita"},
        headers=_headers(token),
    )

    assert respuesta.status_code == 422
    assert respuesta.json()["error"]["code"] == "datos_invalidos"


async def test_cambiar_password_requiere_autenticacion(client: AsyncClient) -> None:
    respuesta = await client.post(
        "/guardians/me/password",
        json={"password": "Otra-Clave-456", "password_confirmation": "Otra-Clave-456"},
    )

    assert respuesta.status_code == 401


# --- POST /guardians/me/confirm-password ---


async def test_confirmar_password_correcta(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "confirmar-ok@example.com", "6000000008")

    respuesta = await client.post(
        "/guardians/me/confirm-password", json={"password": _PASSWORD_REGISTRO}, headers=_headers(token)
    )

    assert respuesta.status_code == 204


async def test_confirmar_password_incorrecta_es_rechazada(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "confirmar-mal@example.com", "6000000009")

    respuesta = await client.post(
        "/guardians/me/confirm-password", json={"password": "clave-equivocada"}, headers=_headers(token)
    )

    assert respuesta.status_code == 401
    assert respuesta.json()["error"]["code"] == "confirmacion_contrasena_invalida"


async def test_confirmar_password_requiere_autenticacion(client: AsyncClient) -> None:
    respuesta = await client.post("/guardians/me/confirm-password", json={"password": _PASSWORD_REGISTRO})

    assert respuesta.status_code == 401


async def test_confirmar_password_bloqueada_tras_maximo_de_intentos(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "confirmar-fuerza-bruta@example.com", "6000000010")
    maximo = get_settings().rate_limit_confirm_password_max

    ultima_respuesta = None
    for _ in range(maximo + 1):
        ultima_respuesta = await client.post(
            "/guardians/me/confirm-password", json={"password": "clave-equivocada"}, headers=_headers(token)
        )

    assert ultima_respuesta is not None
    assert ultima_respuesta.status_code == 429
    assert ultima_respuesta.json()["error"]["code"] == "limite_intentos_excedido"
