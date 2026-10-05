# The teacher's profile (HU-96): about me, studies and experience,
# optional at registration and editable later from their panel.

from __future__ import annotations

from datetime import date

import pytest
from httpx import AsyncClient, Response

from tests.conftest import activar_2fa_docente, registrar_tutor


def _registro_docente(correo: str, document_number: str, profile: dict | None = None) -> dict:
    payload: dict = {
        "first_name": "Carlos",
        "last_name": "Ruiz",
        "email": correo,
        "password": "Clave-Segura-123",
        "institution": "Colegio Nacional",
        "document_type_id": 1,
        "document_number": document_number,
        "date_of_birth": "1988-06-20",
        "phone_country_code": "57",
        "phone_number": "3009876543",
        "document_issued_at": "2006-07-01",
        "consent": {"policy_version": "1.1", "accepts_data_processing": True},
    }
    if profile is not None:
        payload["profile"] = profile
    return payload


def _perfil() -> dict:
    return {
        "about": "  Docente de primaria hace 8 años.\nMe gusta enseñar con juegos.  ",
        "studies": [
            {
                "level": "professional",
                "title": "Licenciatura en Educación Básica",
                "institution": "Universidad Pontificia Bolivariana",
                "end_month": "2015-11",
            },
            {"level": "masters", "title": "Maestría en Educación Inclusiva", "institution": "UIS", "in_progress": True},
        ],
        "experiences": [
            {"role": "Docente de matemáticas", "place": "Colegio San José", "start_month": "2016-02"},
            {
                "role": "Tutor",
                "place": "Clases particulares",
                "start_month": "2014-01",
                "end_month": "2016-01",
                "description": "Refuerzo escolar a niños de primaria.",
            },
        ],
    }


# A registered teacher whose session already passed the 2FA code, the only
# kind that gets to their profile.
async def _docente(client: AsyncClient, correo: str, document_number: str, profile: dict | None = None) -> str:
    response = await client.post("/auth/teachers", json=_registro_docente(correo, document_number, profile))
    assert response.status_code == 201, response.text
    _secret, token = await activar_2fa_docente(client, response.json()["access_token"])
    return token


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# Saving from Mi perfil always goes with the truthful declaration.
async def _guardar(client: AsyncClient, token: str, perfil: dict) -> Response:
    return await client.put(
        "/teachers/me/profile", json={**perfil, "truthful_declaration": True}, headers=_auth(token)
    )


async def test_el_docente_lee_los_datos_de_su_cuenta_sin_secretos(client: AsyncClient) -> None:
    token = await _docente(client, "cuenta-docente@example.com", "81000012")

    response = await client.get("/teachers/me", headers=_auth(token))

    assert response.status_code == 200
    body = response.json()
    assert body["first_name"] == "Carlos"
    assert body["email"] == "cuenta-docente@example.com"
    assert body["institution"] == "Colegio Nacional"
    assert body["document_issued_at"] == "2006-07-01"
    assert not {"password", "hash_password", "totp_secret"} & set(body)


async def test_sin_el_codigo_2fa_no_se_leen_los_datos_de_la_cuenta(client: AsyncClient) -> None:
    response = await client.post("/auth/teachers", json=_registro_docente("cuenta-sin-2fa@example.com", "81000013"))
    token = response.json()["access_token"]

    assert (await client.get("/teachers/me", headers=_auth(token))).status_code == 403


async def test_sin_perfil_al_registrarse_queda_vacio(client: AsyncClient) -> None:
    token = await _docente(client, "perfil-vacio@example.com", "81000001")

    response = await client.get("/teachers/me/profile", headers=_auth(token))

    assert response.status_code == 200
    assert response.json() == {"about": None, "studies": [], "experiences": []}


async def test_el_perfil_del_registro_se_guarda_con_la_cuenta(client: AsyncClient) -> None:
    token = await _docente(client, "perfil-registro@example.com", "81000002", _perfil())

    body = (await client.get("/teachers/me/profile", headers=_auth(token))).json()

    assert body["about"] == "Docente de primaria hace 8 años.\nMe gusta enseñar con juegos."
    # The master's is still in progress, so it goes first.
    assert [s["title"] for s in body["studies"]] == [
        "Maestría en Educación Inclusiva",
        "Licenciatura en Educación Básica",
    ]
    assert body["studies"][0] == {
        "level": "masters",
        "title": "Maestría en Educación Inclusiva",
        "institution": "UIS",
        "end_month": None,
        "in_progress": True,
    }
    assert body["experiences"][0]["end_month"] is None
    assert body["experiences"][1]["start_month"] == "2014-01"
    assert body["experiences"][1]["end_month"] == "2016-01"


async def test_un_perfil_invalido_no_deja_la_cuenta_a_medias(client: AsyncClient) -> None:
    perfil = {"studies": [{"level": "masters", "title": "Maestría", "institution": "UIS", "end_month": "2015-06", "in_progress": True}]}
    fallido = await client.post("/auth/teachers", json=_registro_docente("medias@example.com", "81000003", perfil))
    assert fallido.status_code == 422

    # Nothing was saved, so the same email and document work right after.
    await _docente(client, "medias@example.com", "81000003")


async def test_editar_reemplaza_todo_el_perfil(client: AsyncClient) -> None:
    token = await _docente(client, "perfil-editar@example.com", "81000004", _perfil())
    nuevo = {
        "about": "",
        "studies": [
            {"level": "technical", "title": "Técnico en primera infancia", "institution": "SENA", "end_month": "2010-12"}
        ],
        "experiences": [],
    }

    response = await _guardar(client, token, nuevo)

    assert response.status_code == 200
    body = response.json()
    assert body["about"] is None
    assert [s["title"] for s in body["studies"]] == ["Técnico en primera infancia"]
    assert body["experiences"] == []
    assert (await client.get("/teachers/me/profile", headers=_auth(token))).json() == body


async def test_los_estudios_van_de_lo_que_cursa_a_lo_mas_antiguo(client: AsyncClient) -> None:
    token = await _docente(client, "perfil-orden@example.com", "81000006")
    estudios = [
        {"level": "technical", "title": "Técnico", "institution": "SENA", "end_month": "2010-11"},
        {"level": "technologist", "title": "Tecnólogo", "institution": "SENA", "in_progress": True},
        {"level": "specialization", "title": "Especialización", "institution": "UIS", "end_month": "2018-06"},
        {"level": "doctorate", "title": "Doctorado", "institution": "UNAL", "in_progress": True},
        {"level": "masters", "title": "Maestría", "institution": "UPB", "end_month": "2018-06"},
        {"level": "professional", "title": "Licenciatura", "institution": "UPB", "end_month": "2018-12"},
    ]

    response = await _guardar(client, token, {"studies": estudios})

    # In progress first (the higher level before), then by month, newest
    # first; on the same month the higher level goes before too.
    esperado = ["Doctorado", "Tecnólogo", "Licenciatura", "Maestría", "Especialización", "Técnico"]
    assert [s["title"] for s in response.json()["studies"]] == esperado
    leido = (await client.get("/teachers/me/profile", headers=_auth(token))).json()
    assert [s["title"] for s in leido["studies"]] == esperado


@pytest.mark.parametrize("fin", ["2020-04", "2019-12"])
async def test_la_fecha_de_fin_no_puede_ser_antes_del_inicio(client: AsyncClient, fin: str) -> None:
    token = await _docente(client, f"perfil-fechas-{fin}@example.com", f"8100007{fin[-1]}")
    trabajo = {"role": "Docente", "place": "Colegio", "start_month": "2020-05", "end_month": fin}

    response = await _guardar(client, token, {"experiences": [trabajo]})

    assert response.status_code == 422
    assert "La fecha de fin no puede ser anterior a la de inicio." in response.text
    # Nothing was saved.
    assert (await client.get("/teachers/me/profile", headers=_auth(token))).json()["experiences"] == []


async def test_el_mismo_mes_de_inicio_y_fin_si_vale(client: AsyncClient) -> None:
    token = await _docente(client, "perfil-mismo-mes@example.com", "81000079")
    trabajo = {"role": "Docente", "place": "Colegio", "start_month": "2020-05", "end_month": "2020-05"}

    response = await _guardar(client, token, {"experiences": [trabajo]})

    assert response.status_code == 200


async def test_las_experiencias_van_del_cargo_actual_a_la_mas_antigua(client: AsyncClient) -> None:
    token = await _docente(client, "perfil-orden-trabajos@example.com", "81000010")
    trabajos = [
        {"role": "Tutor", "place": "Casa", "start_month": "2010-01", "end_month": "2012-06"},
        {"role": "Docente", "place": "Colegio A", "start_month": "2015-02"},
        {"role": "Coordinador", "place": "Colegio B", "start_month": "2013-01", "end_month": "2019-11"},
        {"role": "Rector", "place": "Colegio C", "start_month": "2021-03"},
        {"role": "Auxiliar", "place": "Colegio D", "start_month": "2017-05", "end_month": "2019-11"},
    ]

    response = await _guardar(client, token, {"experiences": trabajos})

    # Current jobs first (the one started later before), then by end month,
    # newest first; on the same end month the one started later goes before.
    esperado = ["Rector", "Docente", "Auxiliar", "Coordinador", "Tutor"]
    assert [e["role"] for e in response.json()["experiences"]] == esperado
    leido = (await client.get("/teachers/me/profile", headers=_auth(token))).json()
    assert [e["role"] for e in leido["experiences"]] == esperado


async def test_caben_2000_caracteres_en_sobre_mi_y_en_cada_descripcion(client: AsyncClient) -> None:
    token = await _docente(client, "perfil-largo@example.com", "81000011")
    perfil = {
        "about": "a" * 2000,
        "experiences": [{"role": "Docente", "place": "Colegio", "start_month": "2020-05", "description": "d" * 2000}],
    }

    response = await _guardar(client, token, perfil)

    assert response.status_code == 200
    # Read back from the real columns, nothing was cut.
    leido = (await client.get("/teachers/me/profile", headers=_auth(token))).json()
    assert len(leido["about"]) == 2000
    assert len(leido["experiences"][0]["description"]) == 2000


async def test_se_puede_guardar_dos_veces_seguidas(client: AsyncClient) -> None:
    token = await _docente(client, "perfil-dos-veces@example.com", "81000005")

    for _ in range(2):
        response = await _guardar(client, token, _perfil())
        assert response.status_code == 200

    assert len(response.json()["studies"]) == 2


_ESTUDIO = {"level": "professional", "title": "Licenciatura", "institution": "UPB"}
_TRABAJO = {"role": "Docente", "place": "Colegio"}
_ESTE_ANIO = date.today().year


@pytest.mark.parametrize(
    "perfil",
    [
        {"studies": [{**_ESTUDIO, "end_month": "2015-06", "in_progress": True}]},
        {"studies": [_ESTUDIO]},
        {"studies": [{**_ESTUDIO, "end_month": "2015"}]},
        {"studies": [{**_ESTUDIO, "end_month": "2015-13"}]},
        {"studies": [{**_ESTUDIO, "end_month": f"{_ESTE_ANIO + 1}-01"}]},
        {"studies": [{**_ESTUDIO, "end_month": "1900-05"}]},
        {"studies": [{**_ESTUDIO, "level": "kinder", "end_month": "2015-06"}]},
        {"studies": [{**_ESTUDIO, "title": "   ", "end_month": "2015-06"}]},
        {"studies": [{**_ESTUDIO, "end_month": "2015-06"}] * 11},
        {"experiences": [{**_TRABAJO, "start_month": "2020-13"}]},
        {"experiences": [{**_TRABAJO, "start_month": f"{_ESTE_ANIO + 1}-01"}]},
        {"experiences": [{**_TRABAJO, "start_month": "2020-05", "end_month": "2020-04"}]},
        {"experiences": [{**_TRABAJO, "start_month": "2020-05", "description": "x" * 2001}]},
        {"about": "Hola\u0000mundo"},
        {"about": "x" * 2001},
    ],
)
async def test_el_servidor_rechaza_un_perfil_mal_armado(client: AsyncClient, perfil: dict) -> None:
    token = await _docente(client, "perfil-malo@example.com", "81000007")

    response = await _guardar(client, token, perfil)

    assert response.status_code == 422


async def test_solo_el_docente_tiene_perfil_docente(client: AsyncClient) -> None:
    tutor = await registrar_tutor(client, "tutor-sin-perfil@example.com", "81000008")

    assert (await client.get("/teachers/me/profile", headers=_auth(tutor))).status_code == 403
    assert (await client.put("/teachers/me/profile", json={}, headers=_auth(tutor))).status_code == 403
    assert (await client.get("/teachers/me/profile")).status_code == 401
