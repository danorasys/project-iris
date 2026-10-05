# The teacher's own account from Mi perfil (HU-71, HU-72): editing their
# data with the truthful declaration, and changing the password with the
# current one and a 2FA code. Same rules as the guardian's.

from __future__ import annotations

import pyotp
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.domain.entities import PROFILE_DECLARATION_VERSION
from app.infrastructure.db import SessionLocal
from app.infrastructure.models import ProfileChangeModel
from tests.conftest import activar_2fa_docente

_PASSWORD = "Clave-Segura-123"


def _registro(correo: str, document_number: str) -> dict:
    return {
        "first_name": "Carlos",
        "last_name": "Ruiz",
        "email": correo,
        "password": _PASSWORD,
        "institution": "Colegio Nacional",
        "document_type_id": 1,
        "document_number": document_number,
        "date_of_birth": "1988-06-20",
        "phone_country_code": "57",
        "phone_number": "3009876543",
        "document_issued_at": "2006-07-01",
        "consent": {"policy_version": "1.1", "accepts_data_processing": True},
    }


def _cambios(**extra: object) -> dict:
    body: dict = {
        "first_name": "Carlos Andrés",
        "last_name": "Ruiz",
        "date_of_birth": "1988-06-20",
        "phone_country_code": "57",
        "phone_number": "3001112233",
        "institution": "Colegio San José",
        "truthful_declaration": True,
    }
    body.update(extra)
    return body


# A teacher whose session already passed the 2FA code. Gives back the
# token and the 2FA secret.
async def _docente(client: AsyncClient, correo: str, document_number: str) -> tuple[str, str]:
    response = await client.post("/auth/teachers", json=_registro(correo, document_number))
    assert response.status_code == 201, response.text
    secret, token = await activar_2fa_docente(client, response.json()["access_token"])
    return token, secret


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _cambios_registrados() -> list[ProfileChangeModel]:
    async with SessionLocal() as session:
        result = await session.execute(select(ProfileChangeModel).order_by(ProfileChangeModel.changed_at))
        return list(result.scalars())


# --- PATCH /teachers/me ---


async def test_el_docente_edita_sus_datos_y_queda_registrado_que_cambio(client: AsyncClient) -> None:
    token, _ = await _docente(client, "edita-docente@example.com", "82000001")

    response = await client.patch("/teachers/me", json=_cambios(), headers=_auth(token))

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["first_name"], body["phone_number"], body["institution"]) == (
        "Carlos Andrés",
        "3001112233",
        "Colegio San José",
    )
    # What identifies the account didn't move.
    assert (body["email"], body["document_number"]) == ("edita-docente@example.com", "82000001")
    [cambio] = await _cambios_registrados()
    # Only the names of the fields, never their values.
    assert sorted(cambio.changed_fields) == ["first_name", "institution", "phone_number"]
    assert cambio.declaration_version == PROFILE_DECLARATION_VERSION


async def test_sin_la_declaracion_de_veracidad_no_se_guarda(client: AsyncClient) -> None:
    token, _ = await _docente(client, "sin-declaracion-docente@example.com", "82000002")

    response = await client.patch("/teachers/me", json=_cambios(truthful_declaration=False), headers=_auth(token))

    assert response.status_code == 422
    leido = (await client.get("/teachers/me", headers=_auth(token))).json()
    assert leido["first_name"] == "Carlos"


async def test_la_institucion_vacia_queda_sin_institucion(client: AsyncClient) -> None:
    token, _ = await _docente(client, "sin-institucion-docente@example.com", "82000003")

    response = await client.patch("/teachers/me", json=_cambios(institution=""), headers=_auth(token))

    assert response.status_code == 200
    assert response.json()["institution"] is None


async def test_guardar_sin_cambios_no_deja_registro(client: AsyncClient) -> None:
    token, _ = await _docente(client, "igual-docente@example.com", "82000004")
    iguales = _cambios(first_name="Carlos", phone_number="3009876543", institution="Colegio Nacional")

    response = await client.patch("/teachers/me", json=iguales, headers=_auth(token))

    assert response.status_code == 200
    assert await _cambios_registrados() == []


async def test_el_correo_y_el_documento_no_se_cambian_desde_aqui(client: AsyncClient) -> None:
    token, _ = await _docente(client, "fijo-docente@example.com", "82000005")
    intento = _cambios(email="otro@example.com", document_number="999", document_issued_at="2010-01-01")

    response = await client.patch("/teachers/me", json=intento, headers=_auth(token))

    assert response.status_code == 200
    body = response.json()
    assert (body["email"], body["document_number"], body["document_issued_at"]) == (
        "fijo-docente@example.com",
        "82000005",
        "2006-07-01",
    )


async def test_la_fecha_de_nacimiento_no_puede_ser_despues_de_la_expedicion(client: AsyncClient) -> None:
    token, _ = await _docente(client, "nacimiento-docente@example.com", "82000006")

    response = await client.patch("/teachers/me", json=_cambios(date_of_birth="2007-01-01"), headers=_auth(token))

    assert response.status_code == 422


@pytest.mark.parametrize(
    "cambio",
    [
        {"first_name": ""},
        {"phone_number": "12"},
        {"date_of_birth": "2015-01-01"},
        {"institution": "x" * 201},
    ],
)
async def test_datos_invalidos_son_rechazados(client: AsyncClient, cambio: dict) -> None:
    token, _ = await _docente(client, "invalido-docente@example.com", "82000007")

    response = await client.patch("/teachers/me", json=_cambios(**cambio), headers=_auth(token))

    assert response.status_code == 422


async def test_sin_el_codigo_2fa_no_se_editan_los_datos(client: AsyncClient) -> None:
    registro = await client.post("/auth/teachers", json=_registro("sin-2fa-docente@example.com", "82000008"))
    plain = registro.json()["access_token"]

    response = await client.patch("/teachers/me", json=_cambios(), headers=_auth(plain))

    assert response.status_code == 403


async def test_un_tutor_no_usa_la_ruta_del_docente(client: AsyncClient) -> None:
    from tests.conftest import registrar_tutor

    tutor = await registrar_tutor(client, "tutor-en-docente@example.com", "82000009")

    response = await client.patch("/teachers/me", json=_cambios(), headers=_auth(tutor))

    assert response.status_code == 403


# --- POST /teachers/me/password ---


def _cambio_password(actual: str, secret: str, nueva: str = "Otra-Clave-456") -> dict:
    return {
        "current_password": actual,
        "code": pyotp.TOTP(secret).now(),
        "password": nueva,
        "password_confirmation": nueva,
    }


async def test_cambiar_la_password_permite_entrar_con_la_nueva(client: AsyncClient) -> None:
    correo = "password-docente@example.com"
    token, secret = await _docente(client, correo, "82000010")

    response = await client.post("/teachers/me/password", json=_cambio_password(_PASSWORD, secret), headers=_auth(token))

    assert response.status_code == 204, response.text
    vieja = await client.post("/auth/login", json={"email": correo, "password": _PASSWORD})
    assert vieja.status_code == 401
    nueva = await client.post("/auth/login", json={"email": correo, "password": "Otra-Clave-456"})
    assert nueva.status_code == 200
    # Every session was closed, this one too.
    assert (await client.get("/teachers/me", headers=_auth(token))).status_code == 401


async def test_con_la_password_actual_incorrecta_no_cambia_nada(client: AsyncClient) -> None:
    correo = "password-mala-docente@example.com"
    token, secret = await _docente(client, correo, "82000011")

    response = await client.post(
        "/teachers/me/password", json=_cambio_password("No-Es-La-Mia-1", secret), headers=_auth(token)
    )

    # 422 and not 401: a 401 would make the web app close the session.
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "contrasena_actual_incorrecta"
    login = await client.post("/auth/login", json={"email": correo, "password": _PASSWORD})
    assert login.status_code == 200


async def test_con_un_codigo_incorrecto_no_cambia_la_password(client: AsyncClient) -> None:
    correo = "password-codigo-docente@example.com"
    token, secret = await _docente(client, correo, "82000012")
    body = _cambio_password(_PASSWORD, secret)
    body["code"] = "000000" if body["code"] != "000000" else "111111"

    response = await client.post("/teachers/me/password", json=body, headers=_auth(token))

    assert response.status_code in (400, 401)
    login = await client.post("/auth/login", json={"email": correo, "password": _PASSWORD})
    assert login.status_code == 200


# --- PUT /teachers/me/profile: same rules as the personal data ---


def _perfil_docente(**extra: object) -> dict:
    body: dict = {
        "about": "Docente de primaria hace 8 años.",
        "studies": [{"level": "professional", "title": "Licenciatura", "institution": "UPB", "end_month": "2015-11"}],
        "experiences": [],
        "truthful_declaration": True,
    }
    body.update(extra)
    return body


async def test_el_perfil_docente_sin_la_declaracion_no_se_guarda(client: AsyncClient) -> None:
    token, _ = await _docente(client, "perfil-sin-declarar@example.com", "82000020")
    sin_declarar = {k: v for k, v in _perfil_docente().items() if k != "truthful_declaration"}

    sin = await client.put("/teachers/me/profile", json=sin_declarar, headers=_auth(token))
    falsa = await client.put("/teachers/me/profile", json=_perfil_docente(truthful_declaration=False), headers=_auth(token))

    assert (sin.status_code, falsa.status_code) == (422, 422)
    leido = (await client.get("/teachers/me/profile", headers=_auth(token))).json()
    assert leido["about"] is None
    assert await _cambios_registrados() == []


async def test_el_perfil_docente_registra_que_partes_cambiaron_y_desde_que_sesion(client: AsyncClient) -> None:
    token, _ = await _docente(client, "perfil-cambios@example.com", "82000021")

    primero = await client.put("/teachers/me/profile", json=_perfil_docente(), headers=_auth(token))
    # Then only the experience changes.
    trabajo = {"role": "Docente de matemáticas", "place": "Colegio San José", "start_month": "2016-02"}
    segundo = await client.put("/teachers/me/profile", json=_perfil_docente(experiences=[trabajo]), headers=_auth(token))

    assert (primero.status_code, segundo.status_code) == (200, 200)
    uno, dos = await _cambios_registrados()
    assert sorted(uno.changed_fields) == ["about", "studies"]
    assert dos.changed_fields == ["experiences"]
    assert dos.declaration_version == PROFILE_DECLARATION_VERSION
    assert dos.session_id is not None


async def test_guardar_el_perfil_docente_igual_no_deja_registro(client: AsyncClient) -> None:
    token, _ = await _docente(client, "perfil-igual@example.com", "82000022")
    await client.put("/teachers/me/profile", json=_perfil_docente(), headers=_auth(token))

    # The same profile again: nothing changed, nothing to record.
    otra_vez = await client.put("/teachers/me/profile", json=_perfil_docente(), headers=_auth(token))

    assert otra_vez.status_code == 200
    assert len(await _cambios_registrados()) == 1


async def test_al_registrarse_el_perfil_docente_no_pide_la_declaracion(client: AsyncClient) -> None:
    registro = _registro("registro-con-perfil@example.com", "82000023")
    registro["profile"] = {"about": "Hola, soy docente."}

    response = await client.post("/auth/teachers", json=registro)

    assert response.status_code == 201, response.text
    assert await _cambios_registrados() == []
