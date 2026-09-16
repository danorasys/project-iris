from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.config import get_settings
from tests.conftest import (
    AVATAR_ID_CORAL,
    AVATAR_ID_VIOLETA,
    DOCUMENT_TYPE_ID_CEDULA,
    DOCUMENT_TYPE_ID_PASAPORTE,
    SUPPORT_CONDITION_ID_OTRA,
    SUPPORT_CONDITION_ID_PREFIERO_NO_ESPECIFICAR,
)

pytestmark = pytest.mark.asyncio


def _payload_registro_tutor(correo: str = "ana.tutor@example.com") -> dict:
    return {
        "guardian": {
            "first_name": "Ana",
            "last_name": "Pérez",
            "document_type_id": 1,
            "document_number": "1020304050",
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


def _payload_registro_docente(correo: str = "docente@example.com", document_number: str = "80012345") -> dict:
    return {
        "first_name": "Carlos",
        "last_name": "Ruiz",
        "email": correo,
        "password": "Clave-Segura-123",
        "institution": "Colegio Nacional",
        "document_type_id": 1,
        "document_number": document_number,
        "date_of_birth": "1988-06-20",
        "phone": "3009876543",
    }


async def test_registro_tutor_con_consentimiento_crea_cuenta_y_devuelve_tokens(client: AsyncClient) -> None:
    response = await client.post("/auth/guardians", json=_payload_registro_tutor())

    assert response.status_code == 201
    body = response.json()
    assert "access_token" in body
    assert "refresh_token" in body


async def test_registro_tutor_sin_aceptar_consentimiento_es_rechazado(client: AsyncClient) -> None:
    payload = _payload_registro_tutor()
    payload["consent"]["accepts_data_processing"] = False

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 422


async def test_registro_tutor_sin_autorizar_condicion_apoyo_es_rechazado(client: AsyncClient) -> None:
    payload = _payload_registro_tutor()
    payload["consent"]["authorizes_support_condition"] = False

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 422


async def test_registro_tutor_menor_de_edad_es_rechazado(client: AsyncClient) -> None:
    payload = _payload_registro_tutor()
    payload["guardian"]["date_of_birth"] = "2015-01-01"

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 422


async def test_registro_tutor_fecha_nacimiento_futura_es_rechazada(client: AsyncClient) -> None:
    payload = _payload_registro_tutor()
    payload["guardian"]["date_of_birth"] = "2099-01-01"

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 422


async def test_registro_tutor_fecha_expedicion_documento_futura_es_rechazada(client: AsyncClient) -> None:
    payload = _payload_registro_tutor()
    payload["guardian"]["document_issued_at"] = "2099-01-01"

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 422


async def test_registro_tutor_fecha_expedicion_documento_anterior_a_nacimiento_es_rechazada(
    client: AsyncClient,
) -> None:
    payload = _payload_registro_tutor()
    payload["guardian"]["document_issued_at"] = "1980-01-01"

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 422


async def test_registro_tutor_codigo_pais_con_simbolo_mas_es_rechazado(client: AsyncClient) -> None:
    payload = _payload_registro_tutor()
    payload["guardian"]["phone_country_code"] = "+57"

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 422


async def test_registro_tutor_numero_telefono_con_letras_es_rechazado(client: AsyncClient) -> None:
    payload = _payload_registro_tutor()
    payload["guardian"]["phone_number"] = "300abc4567"

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 422


async def test_registro_tutor_telefono_supera_quince_digitos_es_rechazado(client: AsyncClient) -> None:
    payload = _payload_registro_tutor()
    payload["guardian"]["phone_country_code"] = "999"
    payload["guardian"]["phone_number"] = "12345678901234"

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 422


async def test_registro_tutor_condicion_inexistente_es_rechazada(client: AsyncClient) -> None:
    payload = _payload_registro_tutor()
    payload["student"]["support_condition_id"] = 9999

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "condicion_apoyo_invalida"


async def test_registro_tutor_otra_condicion_sin_especificar_es_rechazada(client: AsyncClient) -> None:
    payload = _payload_registro_tutor()
    payload["student"]["support_condition_id"] = SUPPORT_CONDITION_ID_OTRA

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "condicion_apoyo_invalida"


async def test_registro_tutor_otra_condicion_especificada_es_aceptada(client: AsyncClient) -> None:
    payload = _payload_registro_tutor("otra.condicion@example.com")
    payload["student"]["support_condition_id"] = SUPPORT_CONDITION_ID_OTRA
    payload["student"]["support_condition_other"] = "Migraña crónica"

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 201


async def test_registro_tutor_especifica_condicion_sin_elegir_otra_es_rechazado(client: AsyncClient) -> None:
    payload = _payload_registro_tutor()
    payload["student"]["support_condition_other"] = "Algo que no debería ir aquí"

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "condicion_apoyo_invalida"


async def test_registro_tutor_necesidad_apoyo_adicional_es_opcional(client: AsyncClient) -> None:
    payload = _payload_registro_tutor("necesidad.adicional@example.com")
    payload["student"]["additional_support_need"] = "Necesita más tiempo para las actividades."

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 201


async def test_registro_tutor_contrasenas_no_coincidentes_es_rechazado(client: AsyncClient) -> None:
    payload = _payload_registro_tutor()
    payload["guardian"]["password_confirmation"] = "Otra-Clave-456"

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 422


async def test_registro_tutor_correo_duplicado_es_rechazado(client: AsyncClient) -> None:
    payload = _payload_registro_tutor("duplicado@example.com")
    await client.post("/auth/guardians", json=payload)

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "correo_ya_registrado"


async def test_registro_tutor_documento_duplicado_es_rechazado(client: AsyncClient) -> None:
    payload = _payload_registro_tutor("primer-documento@example.com")
    await client.post("/auth/guardians", json=payload)

    payload_repetido = _payload_registro_tutor("segundo-documento@example.com")
    payload_repetido["guardian"]["document_number"] = payload["guardian"]["document_number"]

    response = await client.post("/auth/guardians", json=payload_repetido)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "documento_ya_registrado"


async def test_registro_docente_con_documento_ya_usado_por_tutor_es_rechazado(client: AsyncClient) -> None:
    payload_tutor = _payload_registro_tutor("tutor-doc-compartido@example.com")
    await client.post("/auth/guardians", json=payload_tutor)

    response = await client.post("/auth/teachers", json=_payload_registro_docente(document_number=payload_tutor["guardian"]["document_number"]))

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "documento_ya_registrado"


async def test_login_tutor_exitoso(client: AsyncClient) -> None:
    await client.post("/auth/guardians", json=_payload_registro_tutor("login@example.com"))

    response = await client.post("/auth/login", json={"email": "login@example.com", "password": "Clave-Segura-123"})

    assert response.status_code == 200
    assert "access_token" in response.json()


async def test_login_credenciales_invalidas(client: AsyncClient) -> None:
    await client.post("/auth/guardians", json=_payload_registro_tutor("malas-creds@example.com"))

    response = await client.post(
        "/auth/login", json={"email": "malas-creds@example.com", "password": "clave-incorrecta"}
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "credenciales_invalidas"


# The rate limit key combines IP and email. Without reading
# X-Forwarded-For (set by api-gateway to the real caller), every request
# would look like it comes from the same address, and one attacker could
# lock out a victim's email from any IP.
async def test_login_usa_x_forwarded_for_para_separar_el_limite_por_ip(client: AsyncClient) -> None:
    await client.post("/auth/guardians", json=_payload_registro_tutor("ip-separada@example.com"))
    maximo = get_settings().rate_limit_login_max

    for _ in range(maximo):
        respuesta = await client.post(
            "/auth/login",
            json={"email": "ip-separada@example.com", "password": "clave-incorrecta"},
            headers={"X-Forwarded-For": "1.1.1.1"},
        )
    assert respuesta.status_code == 401

    bloqueada = await client.post(
        "/auth/login",
        json={"email": "ip-separada@example.com", "password": "clave-incorrecta"},
        headers={"X-Forwarded-For": "1.1.1.1"},
    )
    assert bloqueada.status_code == 429

    # A different X-Forwarded-For is a different bucket, so it's not blocked yet.
    otra_ip = await client.post(
        "/auth/login",
        json={"email": "ip-separada@example.com", "password": "clave-incorrecta"},
        headers={"X-Forwarded-For": "2.2.2.2"},
    )
    assert otra_ip.status_code == 401


async def test_login_fuerza_bruta_bloqueada_tras_maximo_de_intentos(client: AsyncClient) -> None:
    await client.post("/auth/guardians", json=_payload_registro_tutor("bruteforce@example.com"))
    maximo = get_settings().rate_limit_login_max

    ultima_respuesta = None
    for _ in range(maximo + 1):
        ultima_respuesta = await client.post(
            "/auth/login", json={"email": "bruteforce@example.com", "password": "clave-incorrecta"}
        )

    assert ultima_respuesta is not None
    assert ultima_respuesta.status_code == 429
    assert ultima_respuesta.json()["error"]["code"] == "limite_intentos_excedido"


async def test_login_perfil_estudiante_con_pin_correcto(client: AsyncClient) -> None:
    registro = await client.post("/auth/guardians", json=_payload_registro_tutor("pin-ok@example.com"))
    access_token = registro.json()["access_token"]

    listado = await client.get("/guardians/me/students", headers={"Authorization": f"Bearer {access_token}"})
    student_id = listado.json()[0]["id"]

    response = await client.post("/auth/students/profile", json={"student_id": student_id, "pin": "1234"})

    assert response.status_code == 200
    assert "access_token" in response.json()


async def test_login_perfil_estudiante_con_pin_incorrecto(client: AsyncClient) -> None:
    registro = await client.post("/auth/guardians", json=_payload_registro_tutor("pin-malo@example.com"))
    access_token = registro.json()["access_token"]
    listado = await client.get("/guardians/me/students", headers={"Authorization": f"Bearer {access_token}"})
    student_id = listado.json()[0]["id"]

    response = await client.post("/auth/students/profile", json={"student_id": student_id, "pin": "9999"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "pin_invalido"


async def test_docente_no_puede_usar_endpoints_de_tutor(client: AsyncClient) -> None:
    registro = await client.post("/auth/teachers", json=_payload_registro_docente("docente@example.com"))
    access_token = registro.json()["access_token"]

    response = await client.get("/guardians/me/students", headers={"Authorization": f"Bearer {access_token}"})

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "permiso_denegado"


async def test_internal_validar_token_requiere_clave_interna(client: AsyncClient) -> None:
    registro = await client.post("/auth/guardians", json=_payload_registro_tutor("interno@example.com"))
    access_token = registro.json()["access_token"]

    sin_clave = await client.get("/internal/tokens/validate", headers={"Authorization": f"Bearer {access_token}"})
    assert sin_clave.status_code == 401

    con_clave = await client.get(
        "/internal/tokens/validate",
        headers={"Authorization": f"Bearer {access_token}", "X-Internal-Key": get_settings().internal_service_key},
    )
    assert con_clave.status_code == 200
    assert con_clave.json()["role"] == "guardian"


async def test_internal_obtener_estudiante_con_tutor(client: AsyncClient) -> None:
    registro = await client.post("/auth/guardians", json=_payload_registro_tutor("consulta-interna@example.com"))
    access_token = registro.json()["access_token"]
    listado = await client.get("/guardians/me/students", headers={"Authorization": f"Bearer {access_token}"})
    student_id = listado.json()[0]["id"]

    sin_clave = await client.get(f"/internal/students/{student_id}")
    assert sin_clave.status_code == 401

    response = await client.get(
        f"/internal/students/{student_id}",
        headers={"X-Internal-Key": get_settings().internal_service_key},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["student_first_name"] == "Sofía"
    assert body["guardian_first_name"] == "Ana"
    assert body["guardian_phone"] == "+573001234567"


async def test_internal_obtener_estudiante_inexistente(client: AsyncClient) -> None:
    response = await client.get(
        "/internal/students/00000000-0000-0000-0000-000000000000",
        headers={"X-Internal-Key": get_settings().internal_service_key},
    )

    assert response.status_code == 404


async def test_health_live_y_ready(client: AsyncClient) -> None:
    live = await client.get("/health/live")
    assert live.status_code == 200

    ready = await client.get("/health/ready")
    assert ready.status_code == 200


async def test_listar_tipos_de_documento(client: AsyncClient) -> None:
    response = await client.get("/catalogs/document-types")

    assert response.status_code == 200
    body = response.json()
    assert body == [
        {"id": 1, "name": "Cédula de ciudadanía"},
        {"id": 2, "name": "Cédula de extranjería"},
        {"id": 3, "name": "Pasaporte"},
    ]


async def test_listar_tipos_de_relacion(client: AsyncClient) -> None:
    response = await client.get("/catalogs/relationship-types")

    assert response.status_code == 200
    body = response.json()
    assert body == [
        {"id": 1, "name": "Madre"},
        {"id": 2, "name": "Padre"},
        {"id": 3, "name": "Acudiente legal"},
        {"id": 4, "name": "Otro"},
    ]


async def test_registro_tutor_con_tipo_de_documento_inexistente_es_rechazado(client: AsyncClient) -> None:
    payload = _payload_registro_tutor("doc-invalido@example.com")
    payload["guardian"]["document_type_id"] = 9999

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "tipo_documento_invalido"


async def test_registro_tutor_con_tipo_de_relacion_inexistente_es_rechazado(client: AsyncClient) -> None:
    payload = _payload_registro_tutor("relacion-invalida@example.com")
    payload["guardian"]["relationship_type_id"] = 9999

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "tipo_relacion_invalido"


async def test_registro_docente_con_tipo_de_documento_inexistente_es_rechazado(client: AsyncClient) -> None:
    payload = _payload_registro_docente("docente-doc-invalido@example.com", document_number="80099999")
    payload["document_type_id"] = 9999

    response = await client.post("/auth/teachers", json=payload)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "tipo_documento_invalido"


async def test_registro_tutor_con_cedula_con_letras_es_rechazado(client: AsyncClient) -> None:
    payload = _payload_registro_tutor("cedula-con-letras@example.com")
    payload["guardian"]["document_type_id"] = DOCUMENT_TYPE_ID_CEDULA
    payload["guardian"]["document_number"] = "10AB304050"

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "formato_documento_invalido"


async def test_registro_tutor_con_cedula_de_mas_de_10_digitos_es_rechazado(client: AsyncClient) -> None:
    payload = _payload_registro_tutor("cedula-larga@example.com")
    payload["guardian"]["document_type_id"] = DOCUMENT_TYPE_ID_CEDULA
    payload["guardian"]["document_number"] = "123456789012"

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "formato_documento_invalido"


async def test_registro_tutor_con_pasaporte_alfanumerico_es_aceptado(client: AsyncClient) -> None:
    payload = _payload_registro_tutor("pasaporte-valido@example.com")
    payload["guardian"]["document_type_id"] = DOCUMENT_TYPE_ID_PASAPORTE
    payload["guardian"]["document_number"] = "AB123456"

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 201


async def test_registro_tutor_con_pasaporte_muy_corto_es_rechazado(client: AsyncClient) -> None:
    payload = _payload_registro_tutor("pasaporte-corto@example.com")
    payload["guardian"]["document_type_id"] = DOCUMENT_TYPE_ID_PASAPORTE
    payload["guardian"]["document_number"] = "AB12"

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "formato_documento_invalido"


async def test_registro_docente_con_cedula_con_letras_es_rechazado(client: AsyncClient) -> None:
    payload = _payload_registro_docente("docente-cedula-letras@example.com", document_number="80AB2345")
    payload["document_type_id"] = DOCUMENT_TYPE_ID_CEDULA

    response = await client.post("/auth/teachers", json=payload)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "formato_documento_invalido"


# Registers a guardian (with the default first student), logs into that
# student's own profile by PIN, and returns the student's access token.
async def _login_como_estudiante(client: AsyncClient, correo_tutor: str) -> str:
    registro = await client.post("/auth/guardians", json=_payload_registro_tutor(correo_tutor))
    access_token = registro.json()["access_token"]
    listado = await client.get("/guardians/me/students", headers={"Authorization": f"Bearer {access_token}"})
    student_id = listado.json()[0]["id"]
    login = await client.post("/auth/students/profile", json={"student_id": student_id, "pin": "1234"})
    return login.json()["access_token"]


async def test_estudiante_puede_elegir_su_avatar(client: AsyncClient) -> None:
    student_token = await _login_como_estudiante(client, "avatar-ok@example.com")

    response = await client.patch(
        "/students/me/avatar",
        json={"avatar_id": AVATAR_ID_CORAL},
        headers={"Authorization": f"Bearer {student_token}"},
    )

    assert response.status_code == 200
    assert response.json()["avatar_id"] == AVATAR_ID_CORAL


async def test_elegir_un_avatar_fuera_del_conjunto_fijo_es_rechazado(client: AsyncClient) -> None:
    student_token = await _login_como_estudiante(client, "avatar-invalido@example.com")

    response = await client.patch(
        "/students/me/avatar",
        json={"avatar_id": 9999},
        headers={"Authorization": f"Bearer {student_token}"},
    )

    assert response.status_code == 422


async def test_tutor_no_puede_usar_el_endpoint_de_avatar_del_estudiante(client: AsyncClient) -> None:
    registro = await client.post("/auth/guardians", json=_payload_registro_tutor("avatar-tutor@example.com"))
    guardian_token = registro.json()["access_token"]

    response = await client.patch(
        "/students/me/avatar",
        json={"avatar_id": AVATAR_ID_CORAL},
        headers={"Authorization": f"Bearer {guardian_token}"},
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "permiso_denegado"


async def test_elegir_avatar_sin_autenticacion_es_rechazado(client: AsyncClient) -> None:
    response = await client.patch("/students/me/avatar", json={"avatar_id": AVATAR_ID_CORAL})

    assert response.status_code == 401


# A 422 tells the client which field failed and why, but must never echo
# back the value it received, since that value can be a password or PIN.
async def test_error_de_validacion_no_repite_la_contrasena_enviada(client: AsyncClient) -> None:
    payload = _payload_registro_tutor("clave-corta@example.com")
    payload["guardian"]["password"] = "corta"

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 422
    body_text = response.text
    assert "corta" not in body_text
    errores = response.json()["error"]["details"]["errores"]
    assert all("input" not in e for e in errores)


@pytest.mark.parametrize(
    "password",
    [
        "sinmayuscula1!",
        "SINMINUSCULA1!",
        "SinNumero!!",
        "SinSimbolo123",
    ],
)
# Same 5 requirements the registration screen already checks on the
# frontend. This confirms the API rejects a weak password on its own,
# for anyone who calls it directly instead of going through the form.
async def test_registro_tutor_con_contrasena_incompleta_es_rechazado(client: AsyncClient, password: str) -> None:
    payload = _payload_registro_tutor("password-debil@example.com")
    payload["guardian"]["password"] = password

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 422


async def test_registro_tutor_con_contrasena_completa_es_aceptado(client: AsyncClient) -> None:
    payload = _payload_registro_tutor("password-fuerte@example.com")
    payload["guardian"]["password"] = "Segura123!"
    payload["guardian"]["password_confirmation"] = "Segura123!"

    response = await client.post("/auth/guardians", json=payload)

    assert response.status_code == 201


async def test_refresh_emite_tokens_nuevos_e_invalida_el_refresh_anterior(client: AsyncClient) -> None:
    registro = await client.post("/auth/guardians", json=_payload_registro_tutor("refresh@example.com"))
    refresh_token = registro.json()["refresh_token"]

    response = await client.post("/auth/refresh", json={"refresh_token": refresh_token})

    assert response.status_code == 200
    nuevos = response.json()
    assert "access_token" in nuevos
    # jti is random on every issue, so the new refresh token is always different
    # even if it were requested in the same second as the original.
    assert nuevos["refresh_token"] != refresh_token

    # The refresh token that was just used is now blacklisted, using it again fails.
    reuso = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert reuso.status_code == 401


async def test_logout_invalida_el_refresh_token(client: AsyncClient) -> None:
    registro = await client.post("/auth/guardians", json=_payload_registro_tutor("logout@example.com"))
    access_token = registro.json()["access_token"]
    refresh_token = registro.json()["refresh_token"]

    response = await client.post(
        "/auth/logout",
        json={"refresh_token": refresh_token},
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert response.status_code == 204

    reuso = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert reuso.status_code == 401


async def test_usuario_actual_tutor(client: AsyncClient) -> None:
    registro = await client.post("/auth/guardians", json=_payload_registro_tutor("me-tutor@example.com"))
    access_token = registro.json()["access_token"]

    response = await client.get("/users/me", headers={"Authorization": f"Bearer {access_token}"})

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "me-tutor@example.com"
    assert body["role"] == "guardian"


async def test_usuario_actual_docente(client: AsyncClient) -> None:
    registro = await client.post("/auth/teachers", json=_payload_registro_docente("me-docente@example.com"))
    access_token = registro.json()["access_token"]

    response = await client.get("/users/me", headers={"Authorization": f"Bearer {access_token}"})

    assert response.status_code == 200
    assert response.json()["role"] == "teacher"


async def test_usuario_actual_como_estudiante_es_rechazado(client: AsyncClient) -> None:
    student_token = await _login_como_estudiante(client, "me-estudiante@example.com")

    response = await client.get("/users/me", headers={"Authorization": f"Bearer {student_token}"})

    assert response.status_code == 404


async def test_tutor_puede_eliminar_su_cuenta_y_pierde_acceso(client: AsyncClient) -> None:
    registro = await client.post("/auth/guardians", json=_payload_registro_tutor("borrar-cuenta@example.com"))
    access_token = registro.json()["access_token"]

    response = await client.delete("/guardians/me", headers={"Authorization": f"Bearer {access_token}"})
    assert response.status_code == 204

    login_tras_borrado = await client.post(
        "/auth/login", json={"email": "borrar-cuenta@example.com", "password": "Clave-Segura-123"}
    )
    assert login_tras_borrado.status_code == 401
