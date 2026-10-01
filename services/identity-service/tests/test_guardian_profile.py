from __future__ import annotations

import asyncio
import base64
import json
import time

import fakeredis.aioredis
import pyotp
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.domain.entities import PROFILE_DECLARATION_VERSION
from app.infrastructure.db import SessionLocal
from app.infrastructure.models import ProfileChangeModel
from tests.conftest import AVATAR_ID_VIOLETA, SUPPORT_CONDITION_ID_PREFIERO_NO_ESPECIFICAR, activar_2fa_y_abrir_portal

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
    await activar_2fa_y_abrir_portal(client, token)
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
            "truthful_declaration": True,
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
            "truthful_declaration": True,
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
            "truthful_declaration": True,
        },
        headers=_headers(token),
    )

    assert respuesta.status_code == 422
    assert respuesta.json()["error"]["code"] == "datos_invalidos"


async def test_actualizar_perfil_con_nombre_en_blanco_es_rechazado(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "perfil-nombre-blanco@example.com", "6000000015")

    respuesta = await client.patch(
        "/guardians/me",
        json={
            "first_name": "   ",
            "last_name": "Pérez",
            "date_of_birth": "1990-04-12",
            "phone_country_code": "57",
            "phone_number": "3001234567",
            "relationship_type_id": 1,
            "truthful_declaration": True,
        },
        headers=_headers(token),
    )

    assert respuesta.status_code == 422
    assert respuesta.json()["error"]["code"] == "datos_invalidos"


async def test_actualizar_perfil_guarda_los_nombres_sin_espacios_sobrantes(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "perfil-espacios@example.com", "6000000016")

    respuesta = await client.patch(
        "/guardians/me",
        json={
            "first_name": "  Ana  ",
            "last_name": " Pérez ",
            "date_of_birth": "1990-04-12",
            "phone_country_code": "57",
            "phone_number": "3001234567",
            "relationship_type_id": 1,
            "truthful_declaration": True,
        },
        headers=_headers(token),
    )

    assert respuesta.status_code == 200
    assert (respuesta.json()["first_name"], respuesta.json()["last_name"]) == ("Ana", "Pérez")


def _perfil(**cambios: object) -> dict:
    datos: dict = {
        "first_name": "Ana",
        "last_name": "Pérez",
        "date_of_birth": "1990-04-12",
        "phone_country_code": "57",
        "phone_number": "3001234567",
        "relationship_type_id": 1,
        "truthful_declaration": True,
    }
    return datos | cambios


async def test_actualizar_perfil_acepta_nombres_compuestos_y_junta_espacios(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "perfil-compuesto@example.com", "6000000017")

    respuesta = await client.patch(
        "/guardians/me", json=_perfil(first_name="María-José   O'Neil"), headers=_headers(token)
    )

    assert respuesta.status_code == 200
    assert respuesta.json()["first_name"] == "María-José O'Neil"


async def test_actualizar_perfil_con_numeros_en_el_nombre_es_rechazado(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "perfil-nombre-numeros@example.com", "6000000018")

    respuesta = await client.patch("/guardians/me", json=_perfil(last_name="Pérez2"), headers=_headers(token))

    assert respuesta.status_code == 422
    assert respuesta.json()["error"]["code"] == "datos_invalidos"


async def test_actualizar_perfil_con_nacimiento_despues_de_la_expedicion_es_rechazado(client: AsyncClient) -> None:
    # An old document (2007), so an adult birth date can still come after it.
    payload = _payload_registro_tutor("perfil-nacimiento-expedicion@example.com", "6000000019")
    payload["guardian"]["document_issued_at"] = "2007-03-01"
    registro = await client.post("/auth/guardians", json=payload)
    assert registro.status_code == 201
    token = registro.json()["access_token"]
    await activar_2fa_y_abrir_portal(client, token)

    respuesta = await client.patch("/guardians/me", json=_perfil(date_of_birth="2008-01-01"), headers=_headers(token))

    assert respuesta.status_code == 422
    assert respuesta.json()["error"]["code"] == "fecha_nacimiento_inconsistente"
    # And nothing changed.
    relectura = await client.get("/guardians/me", headers=_headers(token))
    assert relectura.json()["date_of_birth"] == "1990-04-12"


async def test_actualizar_perfil_con_edad_imposible_es_rechazado(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "perfil-edad-imposible@example.com", "6000000020")

    respuesta = await client.patch("/guardians/me", json=_perfil(date_of_birth="1850-01-01"), headers=_headers(token))

    assert respuesta.status_code == 422


async def test_actualizar_perfil_con_telefono_que_no_existe_es_rechazado(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "perfil-telefono-falso@example.com", "6000000021")

    respuesta = await client.patch("/guardians/me", json=_perfil(phone_number="0001234567"), headers=_headers(token))

    assert respuesta.status_code == 422
    assert respuesta.json()["error"]["code"] == "datos_invalidos"


async def _cambios_registrados() -> list[ProfileChangeModel]:
    async with SessionLocal() as session:
        result = await session.execute(select(ProfileChangeModel).order_by(ProfileChangeModel.changed_at))
        return list(result.scalars())


def _sid(token: str) -> str:
    # Reads the session id from the token, without checking the signature.
    payload = token.split(".")[1]
    sid: str = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))["sid"]
    return sid


async def test_actualizar_perfil_sin_la_declaracion_es_rechazado_y_no_cambia_nada(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "perfil-sin-declaracion@example.com", "6000000040")
    cuerpo = _perfil(last_name="Gómez")
    del cuerpo["truthful_declaration"]

    respuesta = await client.patch("/guardians/me", json=cuerpo, headers=_headers(token))

    assert respuesta.status_code == 422
    assert respuesta.json()["error"]["code"] == "datos_invalidos"
    assert (await client.get("/guardians/me", headers=_headers(token))).json()["last_name"] == "Pérez"
    assert await _cambios_registrados() == []


async def test_actualizar_perfil_sin_aceptar_la_declaracion_es_rechazado(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "perfil-declaracion-falsa@example.com", "6000000041")

    respuesta = await client.patch(
        "/guardians/me", json=_perfil(last_name="Gómez", truthful_declaration=False), headers=_headers(token)
    )

    assert respuesta.status_code == 422
    assert "correcta y veraz" in str(respuesta.json()["error"]["details"])
    assert await _cambios_registrados() == []


@pytest.mark.parametrize("declaracion", ["true", "yes", 1])
async def test_actualizar_perfil_solo_acepta_la_declaracion_como_true_real(client: AsyncClient, declaracion: object) -> None:
    token = await _registrar_y_obtener_token(client, f"perfil-declaracion-{declaracion}@example.com", f"600000005{len(str(declaracion))}")

    respuesta = await client.patch(
        "/guardians/me", json=_perfil(last_name="Gómez", truthful_declaration=declaracion), headers=_headers(token)
    )

    assert respuesta.status_code == 422
    assert await _cambios_registrados() == []


async def test_actualizar_perfil_registra_que_campos_cambiaron_sin_sus_valores(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "perfil-registro@example.com", "6000000042")

    respuesta = await client.patch(
        "/guardians/me", json=_perfil(last_name="Gómez", phone_number="3009998877"), headers=_headers(token)
    )

    assert respuesta.status_code == 200
    cambios = await _cambios_registrados()
    assert len(cambios) == 1
    cambio = cambios[0]
    assert cambio.changed_fields == ["last_name", "phone_number"]
    assert cambio.declaration_version == PROFILE_DECLARATION_VERSION
    assert cambio.session_id == _sid(token)
    # Only the names of the fields: neither the old nor the new values.
    guardado = str([cambio.changed_fields, cambio.declaration_version, cambio.session_id])
    for valor in ("Gómez", "Pérez", "3009998877", "3001234567"):
        assert valor not in guardado


async def test_guardar_el_perfil_sin_cambiar_nada_no_registra_nada(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "perfil-sin-cambios@example.com", "6000000043")

    respuesta = await client.patch("/guardians/me", json=_perfil(), headers=_headers(token))

    assert respuesta.status_code == 200
    assert await _cambios_registrados() == []


async def test_cada_guardado_con_cambios_queda_registrado(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "perfil-dos-cambios@example.com", "6000000044")

    await client.patch("/guardians/me", json=_perfil(first_name="Ana María"), headers=_headers(token))
    await client.patch(
        "/guardians/me", json=_perfil(first_name="Ana María", relationship_type_id=2), headers=_headers(token)
    )

    assert [c.changed_fields for c in await _cambios_registrados()] == [["first_name"], ["relationship_type_id"]]


async def test_eliminar_la_cuenta_borra_su_registro_de_cambios(client: AsyncClient) -> None:
    token = await _registrar_y_obtener_token(client, "perfil-borrar-registro@example.com", "6000000045")
    await client.patch("/guardians/me", json=_perfil(last_name="Gómez"), headers=_headers(token))
    assert len(await _cambios_registrados()) == 1

    respuesta = await client.delete("/guardians/me", headers=_headers(token))

    assert respuesta.status_code == 204
    assert await _cambios_registrados() == []


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
            "truthful_declaration": True,
        },
    )

    assert respuesta.status_code == 401


# --- POST /guardians/me/password ---


async def _registrar_con_secreto(client: AsyncClient, correo: str, document_number: str) -> tuple[str, str]:
    respuesta = await client.post("/auth/guardians", json=_payload_registro_tutor(correo, document_number))
    assert respuesta.status_code == 201
    token: str = respuesta.json()["access_token"]
    secret = await activar_2fa_y_abrir_portal(client, token)
    return token, secret


def _cambio(actual: str, secret: str, nueva: str = "Otra-Clave-456", code: str | None = None) -> dict:
    return {
        "current_password": actual,
        "code": code if code is not None else pyotp.TOTP(secret).now(),
        "password": nueva,
        "password_confirmation": nueva,
    }


def _codigo_incorrecto(secret: str) -> str:
    return "000000" if pyotp.TOTP(secret).now() != "000000" else "111111"


async def test_cambiar_password_permite_iniciar_sesion_con_la_nueva(client: AsyncClient) -> None:
    correo = "password-cambio@example.com"
    token, secret = await _registrar_con_secreto(client, correo, "6000000005")

    respuesta = await client.post("/guardians/me/password", json=_cambio(_PASSWORD_REGISTRO, secret), headers=_headers(token))

    assert respuesta.status_code == 204
    login_con_password_vieja = await client.post("/auth/login", json={"email": correo, "password": _PASSWORD_REGISTRO})
    assert login_con_password_vieja.status_code == 401
    login_con_password_nueva = await client.post("/auth/login", json={"email": correo, "password": "Otra-Clave-456"})
    assert login_con_password_nueva.status_code == 200


async def test_cambiar_password_con_confirmacion_distinta_es_rechazado(client: AsyncClient) -> None:
    token, secret = await _registrar_con_secreto(client, "password-no-coincide@example.com", "6000000006")
    cuerpo = _cambio(_PASSWORD_REGISTRO, secret)
    cuerpo["password_confirmation"] = "Otra-Clave-Distinta-789"

    respuesta = await client.post("/guardians/me/password", json=cuerpo, headers=_headers(token))

    assert respuesta.status_code == 422
    assert respuesta.json()["error"]["code"] == "datos_invalidos"


async def test_cambiar_password_debil_es_rechazado(client: AsyncClient) -> None:
    token, secret = await _registrar_con_secreto(client, "password-debil@example.com", "6000000007")

    respuesta = await client.post(
        "/guardians/me/password", json=_cambio(_PASSWORD_REGISTRO, secret, "debilita"), headers=_headers(token)
    )

    assert respuesta.status_code == 422
    assert respuesta.json()["error"]["code"] == "datos_invalidos"


async def test_cambiar_password_con_la_actual_incorrecta_es_rechazado_y_no_cambia_nada(client: AsyncClient) -> None:
    correo = "password-actual-mala@example.com"
    token, secret = await _registrar_con_secreto(client, correo, "6000000022")

    respuesta = await client.post("/guardians/me/password", json=_cambio("No-Es-La-Mia-1", secret), headers=_headers(token))

    # 422 and not 401: a 401 would make the web app close the session.
    assert respuesta.status_code == 422
    assert respuesta.json()["error"]["code"] == "contrasena_actual_incorrecta"
    login = await client.post("/auth/login", json={"email": correo, "password": _PASSWORD_REGISTRO})
    assert login.status_code == 200


async def test_cambiar_password_sin_la_actual_es_rechazado(client: AsyncClient) -> None:
    token, secret = await _registrar_con_secreto(client, "password-sin-actual@example.com", "6000000023")
    cuerpo = _cambio(_PASSWORD_REGISTRO, secret)
    del cuerpo["current_password"]

    respuesta = await client.post("/guardians/me/password", json=cuerpo, headers=_headers(token))

    assert respuesta.status_code == 422
    assert respuesta.json()["error"]["code"] == "datos_invalidos"


async def test_cambiar_password_por_la_misma_es_rechazado(client: AsyncClient) -> None:
    token, secret = await _registrar_con_secreto(client, "password-misma@example.com", "6000000024")

    respuesta = await client.post(
        "/guardians/me/password", json=_cambio(_PASSWORD_REGISTRO, secret, _PASSWORD_REGISTRO), headers=_headers(token)
    )

    assert respuesta.status_code == 422
    assert "igual a la que escribiste" in str(respuesta.json()["error"]["details"])


async def test_cambiar_password_por_una_que_bcrypt_ve_igual_a_la_actual_es_rechazado(
    client: AsyncClient, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    # bcrypt only reads the first 72 bytes, so these two long passwords are
    # different text but the same password for it.
    larga = "Aa1-" + "x" * 70 + "A"
    casi_igual = larga[:-1] + "B"
    correo = "password-larga@example.com"
    token, secret = await _registrar_con_secreto(client, correo, "6000000030")
    primera = await client.post("/guardians/me/password", json=_cambio(_PASSWORD_REGISTRO, secret, larga), headers=_headers(token))
    assert primera.status_code == 204
    # The change closes every session issued before the next whole second, so
    # the new login waits for it (token dates have whole seconds).
    await asyncio.sleep(1.2)
    login = await client.post("/auth/login", json={"email": correo, "password": larga})
    token = login.json()["access_token"]
    # Lets the same 30 second code be typed again in the second change.
    for clave in [k async for k in redis_client.scan_iter(match="ratelimit:portal-2fa-used:*")]:
        await redis_client.delete(clave)

    respuesta = await client.post("/guardians/me/password", json=_cambio(larga, secret, casi_igual), headers=_headers(token))

    assert respuesta.status_code == 422
    assert respuesta.json()["error"]["code"] == "contrasena_igual_a_la_actual"


async def test_adivinar_la_password_actual_se_bloquea(client: AsyncClient) -> None:
    token, secret = await _registrar_con_secreto(client, "password-fuerza-bruta@example.com", "6000000025")

    respuestas = [
        await client.post("/guardians/me/password", json=_cambio(f"Intento-{i}-Malo", secret), headers=_headers(token))
        for i in range(8)
    ]
    codigos = [r.status_code for r in respuestas]

    # A few wrong tries are answered normally, then the form gets locked...
    assert codigos[0] == 422
    assert 429 in codigos
    # ...and while locked, not even the right password gets checked.
    bloqueado = await client.post(
        "/guardians/me/password", json=_cambio(_PASSWORD_REGISTRO, secret), headers=_headers(token)
    )
    assert bloqueado.status_code == 429


async def test_cambiar_password_sin_codigo_2fa_es_rechazado(client: AsyncClient) -> None:
    token, secret = await _registrar_con_secreto(client, "password-sin-codigo@example.com", "6000000026")
    cuerpo = _cambio(_PASSWORD_REGISTRO, secret)
    del cuerpo["code"]

    respuesta = await client.post("/guardians/me/password", json=cuerpo, headers=_headers(token))

    assert respuesta.status_code == 422
    assert respuesta.json()["error"]["code"] == "datos_invalidos"


async def test_cambiar_password_con_codigo_incorrecto_no_cambia_nada(client: AsyncClient) -> None:
    correo = "password-codigo-malo@example.com"
    token, secret = await _registrar_con_secreto(client, correo, "6000000027")

    respuesta = await client.post(
        "/guardians/me/password",
        json=_cambio(_PASSWORD_REGISTRO, secret, code=_codigo_incorrecto(secret)),
        headers=_headers(token),
    )

    assert respuesta.status_code == 401
    assert respuesta.json()["error"]["code"] == "codigo_totp_invalido"
    login = await client.post("/auth/login", json={"email": correo, "password": _PASSWORD_REGISTRO})
    assert login.status_code == 200


async def test_el_codigo_sirve_de_nuevo_si_la_password_actual_estaba_mal(client: AsyncClient) -> None:
    token, secret = await _registrar_con_secreto(client, "password-reintento@example.com", "6000000028")
    codigo = pyotp.TOTP(secret).now()

    malo = await client.post("/guardians/me/password", json=_cambio("No-Es-La-Mia-1", secret, code=codigo), headers=_headers(token))
    bueno = await client.post("/guardians/me/password", json=_cambio(_PASSWORD_REGISTRO, secret, code=codigo), headers=_headers(token))

    assert malo.status_code == 422
    assert bueno.status_code == 204


async def test_un_codigo_ya_usado_en_el_portal_no_sirve_para_cambiar_la_password(client: AsyncClient) -> None:
    token, secret = await _registrar_con_secreto(client, "password-codigo-repetido@example.com", "6000000060")
    codigo = pyotp.TOTP(secret).at(time.time() + 30)
    portal = await client.post("/guardians/me/2fa/challenge", json={"code": codigo}, headers=_headers(token))

    respuesta = await client.post(
        "/guardians/me/password", json=_cambio(_PASSWORD_REGISTRO, secret, code=codigo), headers=_headers(token)
    )

    assert portal.status_code == 200
    assert respuesta.status_code == 401
    assert respuesta.json()["error"]["code"] == "codigo_totp_invalido"


async def test_cambiar_password_no_depende_del_acceso_al_portal(
    client: AsyncClient, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    token, secret = await _registrar_con_secreto(client, "password-sin-portal@example.com", "6000000029")
    # The portal access ran out, the fresh code is proof enough.
    for clave in [k async for k in redis_client.scan_iter(match="portal-access:*")]:
        await redis_client.delete(clave)

    respuesta = await client.post("/guardians/me/password", json=_cambio(_PASSWORD_REGISTRO, secret), headers=_headers(token))

    assert respuesta.status_code == 204


async def test_cambiar_password_requiere_autenticacion(client: AsyncClient) -> None:
    respuesta = await client.post(
        "/guardians/me/password",
        json={
            "current_password": _PASSWORD_REGISTRO,
            "code": "123456",
            "password": "Otra-Clave-456",
            "password_confirmation": "Otra-Clave-456",
        },
    )

    assert respuesta.status_code == 401
