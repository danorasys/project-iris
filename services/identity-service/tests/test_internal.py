# The /internal routes other services call to build and show notifications:
# who the guardian of a kid is, a teacher's name, and whether a guardian's
# session has the parents' portal open.

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from app.config import get_settings
from tests.conftest import registrar_tutor, registrar_tutor_con_2fa

pytestmark = pytest.mark.asyncio


def _internal() -> dict[str, str]:
    return {"X-Internal-Key": get_settings().internal_service_key}


async def _claims(client: AsyncClient, token: str) -> dict:
    validated = await client.get(
        "/internal/tokens/validate", headers={"Authorization": f"Bearer {token}", **_internal()}
    )
    return validated.json()


async def _student_id(client: AsyncClient, token: str) -> str:
    lista = await client.get("/guardians/me/students", headers={"Authorization": f"Bearer {token}"})
    student_id: str = lista.json()[0]["id"]
    return student_id


async def test_el_estudiante_trae_el_id_de_su_tutor(client: AsyncClient) -> None:
    token = await registrar_tutor(client, "interno-tutor@example.com", "9100000001")
    student_id = await _student_id(client, token)

    respuesta = await client.get(f"/internal/students/{student_id}", headers=_internal())

    assert respuesta.status_code == 200
    assert respuesta.json()["guardian_person_id"] == (await _claims(client, token))["sub"]


async def test_los_peques_de_un_tutor(client: AsyncClient) -> None:
    token = await registrar_tutor(client, "interno-peques@example.com", "9100000004")
    person_id = (await _claims(client, token))["sub"]
    student_id = await _student_id(client, token)

    respuesta = await client.get(f"/internal/guardians/{person_id}/students", headers=_internal())

    assert respuesta.status_code == 200
    assert [s["student_id"] for s in respuesta.json()] == [student_id]
    assert set(respuesta.json()[0]) == {"student_id", "first_name", "avatar_id"}


async def test_quien_no_es_tutor_no_tiene_peques(client: AsyncClient) -> None:
    respuesta = await client.get(f"/internal/guardians/{uuid.uuid4()}/students", headers=_internal())
    sin_clave = await client.get(f"/internal/guardians/{uuid.uuid4()}/students")

    assert respuesta.status_code == 404
    assert sin_clave.status_code == 401


async def test_el_nombre_de_un_docente(client: AsyncClient) -> None:
    registro = await client.post(
        "/auth/teachers",
        json={
            "first_name": "Carlos",
            "last_name": "Ruiz",
            "email": "interno-docente@example.com",
            "password": "Clave-Segura-123",
            "institution": "Colegio Nacional",
            "document_type_id": 1,
            "document_number": "80099001",
            "date_of_birth": "1988-06-20",
            "phone_country_code": "57",
            "phone_number": "3009876543",
            "document_issued_at": "2006-07-01",
            "consent": {"policy_version": "1.1", "accepts_data_processing": True},
        },
    )
    teacher_id = (await _claims(client, registro.json()["access_token"]))["sub"]

    respuesta = await client.get(f"/internal/teachers/{teacher_id}", headers=_internal())

    assert respuesta.status_code == 200
    assert respuesta.json() == {"first_name": "Carlos", "last_name": "Ruiz"}


async def test_un_tutor_no_pasa_por_docente(client: AsyncClient) -> None:
    token = await registrar_tutor(client, "interno-no-docente@example.com", "9100000002")
    person_id = (await _claims(client, token))["sub"]

    assert (await client.get(f"/internal/teachers/{person_id}", headers=_internal())).status_code == 404
    assert (await client.get(f"/internal/teachers/{uuid.uuid4()}", headers=_internal())).status_code == 404


# HU-97: what a family sees of the teacher of a class. The profile they
# filled in and their name, never their email, phone or document.
async def test_el_perfil_publico_de_un_docente_sin_contacto(client: AsyncClient) -> None:
    registro = await client.post(
        "/auth/teachers",
        json={
            "first_name": "Laura",
            "last_name": "Gómez",
            "email": "interno-perfil@example.com",
            "password": "Clave-Segura-123",
            "institution": "Colegio Nacional",
            "document_type_id": 1,
            "document_number": "80099002",
            "date_of_birth": "1988-06-20",
            "phone_country_code": "57",
            "phone_number": "3009876544",
            "document_issued_at": "2006-07-01",
            "consent": {"policy_version": "1.1", "accepts_data_processing": True},
            "profile": {
                "about": "Docente de primaria.",
                "studies": [{"level": "professional", "title": "Licenciatura", "institution": "UPB", "end_month": "2015-11"}],
                "experiences": [{"role": "Docente", "place": "Colegio San José", "start_month": "2016-02"}],
            },
        },
    )
    teacher_id = (await _claims(client, registro.json()["access_token"]))["sub"]

    respuesta = await client.get(f"/internal/teachers/{teacher_id}/profile", headers=_internal())

    assert respuesta.status_code == 200
    perfil = respuesta.json()
    assert set(perfil) == {"first_name", "last_name", "institution", "about", "studies", "experiences"}
    assert (perfil["first_name"], perfil["about"]) == ("Laura", "Docente de primaria.")
    assert perfil["institution"] == "Colegio Nacional"
    assert perfil["studies"][0]["title"] == "Licenciatura"
    assert perfil["experiences"][0]["place"] == "Colegio San José"
    texto = respuesta.text
    assert "interno-perfil@example.com" not in texto and "80099002" not in texto and "3009876544" not in texto


async def test_el_perfil_publico_solo_es_de_docentes(client: AsyncClient) -> None:
    token = await registrar_tutor(client, "interno-perfil-tutor@example.com", "9100000005")
    person_id = (await _claims(client, token))["sub"]

    no_docente = await client.get(f"/internal/teachers/{person_id}/profile", headers=_internal())
    sin_clave = await client.get(f"/internal/teachers/{person_id}/profile")

    assert no_docente.status_code == 404
    assert sin_clave.status_code == 401


async def test_el_acceso_al_portal_responde_por_cada_sesion(client: AsyncClient) -> None:
    token, _secret = await registrar_tutor_con_2fa(client, "interno-portal@example.com", "9100000003")
    claims = await _claims(client, token)
    abierta = {"person_id": claims["sub"], "session_id": claims["extra"]["sid"]}

    con_portal = await client.post("/internal/portal-access/check", json=abierta, headers=_internal())
    renovando = await client.post("/internal/portal-access/check", json=abierta | {"renew": True}, headers=_internal())
    otra_sesion = await client.post(
        "/internal/portal-access/check", json=abierta | {"session_id": "otra-sesion"}, headers=_internal()
    )

    assert con_portal.status_code == 204
    assert renovando.status_code == 204
    assert otra_sesion.status_code == 403
    assert otra_sesion.json()["error"]["code"] == "acceso_portal_requerido"


async def test_las_rutas_internas_nuevas_exigen_la_clave_interna(client: AsyncClient) -> None:
    sin_clave = await client.post(
        "/internal/portal-access/check", json={"person_id": str(uuid.uuid4()), "session_id": "x"}
    )
    docente_sin_clave = await client.get(f"/internal/teachers/{uuid.uuid4()}")

    assert sin_clave.status_code == 401
    assert docente_sin_clave.status_code == 401
