from __future__ import annotations

import pyotp
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.domain.entities import PROFILE_DECLARATION_VERSION
from app.infrastructure.db import SessionLocal
from app.infrastructure.models import ProfileChangeModel
from tests.conftest import (
    SUPPORT_CONDITION_ID_OTRA,
    SUPPORT_CONDITION_ID_PARALISIS_CEREBRAL,
    SUPPORT_CONDITION_ID_PREFIERO_NO_ESPECIFICAR,
    activar_2fa_y_abrir_portal,
    payload_registro_tutor,
    registrar_tutor,
    registrar_tutor_con_2fa,
)

pytestmark = pytest.mark.asyncio


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _tutor_con_peque(client: AsyncClient, correo: str, document_number: str) -> tuple[str, str]:
    # A guardian with the portal open and the id of the kid they registered.
    token, _secret = await registrar_tutor_con_2fa(client, correo, document_number)
    lista = await client.get("/guardians/me/students", headers=_headers(token))
    student_id: str = lista.json()[0]["id"]
    return token, student_id


def _datos(**cambios: object) -> dict:
    datos: dict = {
        "first_name": "Sofía",
        "last_name": "Pérez",
        "date_of_birth": "2018-05-10",
        "avatar_id": 1,
        "support_condition_ids": [SUPPORT_CONDITION_ID_PREFIERO_NO_ESPECIFICAR],
        "support_condition_other": None,
        "additional_support_need": None,
        "truthful_declaration": True,
    }
    return datos | cambios


async def _cambios_registrados() -> list[ProfileChangeModel]:
    async with SessionLocal() as session:
        result = await session.execute(select(ProfileChangeModel).order_by(ProfileChangeModel.changed_at))
        return list(result.scalars())


async def _entrar_con_pin(client: AsyncClient, token: str, student_id: str, pin: str):  # type: ignore[no-untyped-def]
    return await client.post(
        "/auth/students/profile", json={"student_id": student_id, "pin": pin}, headers=_headers(token)
    )


async def _tutor_con_peque_y_secreto(client: AsyncClient, correo: str, document_number: str) -> tuple[str, str, str]:
    token, secret = await registrar_tutor_con_2fa(client, correo, document_number)
    lista = await client.get("/guardians/me/students", headers=_headers(token))
    student_id: str = lista.json()[0]["id"]
    return token, student_id, secret


# The body to change a PIN. The kid is registered with the PIN 1234.
def _pin(secret: str, nuevo: str = "9876", actual: str = "1234", **cambios: str) -> dict[str, str]:
    cuerpo = {
        "current_pin": actual,
        "code": pyotp.TOTP(secret).now(),
        "pin": nuevo,
        "pin_confirmation": nuevo,
    }
    return cuerpo | cambios


def _codigo_incorrecto(secret: str) -> str:
    return "000000" if pyotp.TOTP(secret).now() != "000000" else "111111"


# --- GET /guardians/me/students (open, for the profile picker) ---


async def test_la_lista_de_peques_no_trae_datos_sensibles(client: AsyncClient) -> None:
    token = await registrar_tutor(client, "peques-lista@example.com", "8000000001")

    respuesta = await client.get("/guardians/me/students", headers=_headers(token))

    assert respuesta.status_code == 200
    # No support condition and no last name: this list works without the 2FA code.
    assert set(respuesta.json()[0]) == {"id", "first_name", "avatar_id", "date_of_birth"}


# --- GET /guardians/me/students/{id} ---


async def test_ver_los_datos_de_un_peque_trae_todo_lo_registrado(client: AsyncClient) -> None:
    token, student_id = await _tutor_con_peque(client, "peque-ver@example.com", "8000000002")

    respuesta = await client.get(f"/guardians/me/students/{student_id}", headers=_headers(token))

    assert respuesta.status_code == 200
    body = respuesta.json()
    assert body["first_name"] == "Sofía"
    assert body["last_name"] == "Pérez"
    assert body["date_of_birth"] == "2018-05-10"
    assert body["support_condition_ids"] == [SUPPORT_CONDITION_ID_PREFIERO_NO_ESPECIFICAR]
    # Never the PIN, not even hashed.
    assert not any("pin" in campo for campo in body)


async def test_ver_los_datos_de_un_peque_exige_el_acceso_al_portal(client: AsyncClient) -> None:
    token, student_id = await _tutor_con_peque(client, "peque-sin-portal@example.com", "8000000003")
    login = await client.post("/auth/login", json={"email": "peque-sin-portal@example.com", "password": "Clave-Segura-123"})
    otra_sesion = login.json()["access_token"]

    respuesta = await client.get(f"/guardians/me/students/{student_id}", headers=_headers(otra_sesion))

    assert respuesta.status_code == 403
    assert respuesta.json()["error"]["code"] == "acceso_portal_requerido"
    assert (await client.get(f"/guardians/me/students/{student_id}", headers=_headers(token))).status_code == 200


async def test_el_peque_de_otro_tutor_responde_como_si_no_existiera(client: AsyncClient) -> None:
    _token, student_id = await _tutor_con_peque(client, "peque-dueno@example.com", "8000000004")
    otro_token, _ = await _tutor_con_peque(client, "peque-ajeno@example.com", "8000000005")

    ver = await client.get(f"/guardians/me/students/{student_id}", headers=_headers(otro_token))
    cambiar = await client.patch(
        f"/guardians/me/students/{student_id}", json=_datos(first_name="Otro"), headers=_headers(otro_token)
    )

    assert ver.status_code == 404
    assert cambiar.status_code == 404
    assert await _cambios_registrados() == []


# --- PATCH /guardians/me/students/{id} ---


async def test_editar_los_datos_de_un_peque_aplica_los_cambios(client: AsyncClient) -> None:
    token, student_id = await _tutor_con_peque(client, "peque-editar@example.com", "8000000006")

    respuesta = await client.patch(
        f"/guardians/me/students/{student_id}",
        json=_datos(
            first_name="Sofía  Valentina",
            last_name="Pérez Gómez",
            date_of_birth="2018-06-11",
            support_condition_ids=[SUPPORT_CONDITION_ID_PARALISIS_CEREBRAL],
            additional_support_need="  Necesita descansos cortos.  ",
        ),
        headers=_headers(token),
    )

    assert respuesta.status_code == 200
    body = respuesta.json()
    # Extra spaces in names are joined and the note is trimmed.
    assert body["first_name"] == "Sofía Valentina"
    assert body["last_name"] == "Pérez Gómez"
    assert body["additional_support_need"] == "Necesita descansos cortos."
    relectura = await client.get(f"/guardians/me/students/{student_id}", headers=_headers(token))
    assert relectura.json() == body


async def test_editar_un_peque_cambia_el_avatar_pero_no_el_pin(client: AsyncClient) -> None:
    token, student_id = await _tutor_con_peque(client, "peque-avatar@example.com", "8000000007")

    respuesta = await client.patch(
        f"/guardians/me/students/{student_id}", json=_datos(avatar_id=2, pin="9999"), headers=_headers(token)
    )

    assert respuesta.status_code == 200
    assert respuesta.json()["avatar_id"] == 2
    cambios = await _cambios_registrados()
    assert [c.changed_fields for c in cambios] == [["avatar_id"]]
    # A PIN sent here is ignored, it has its own route.
    assert (await _entrar_con_pin(client, token, student_id, "1234")).status_code == 200


async def test_un_avatar_que_no_existe_no_se_guarda(client: AsyncClient) -> None:
    token, student_id = await _tutor_con_peque(client, "peque-avatar-malo@example.com", "8000000013")

    respuesta = await client.patch(
        f"/guardians/me/students/{student_id}", json=_datos(avatar_id=9999), headers=_headers(token)
    )

    assert respuesta.status_code == 422
    assert await _cambios_registrados() == []


@pytest.mark.parametrize("declaracion", [None, False, "true"])
async def test_editar_un_peque_exige_la_declaracion_de_veracidad(client: AsyncClient, declaracion: object) -> None:
    token, student_id = await _tutor_con_peque(client, f"peque-declara-{declaracion}@example.com", f"800000001{len(str(declaracion))}")
    cuerpo = _datos(first_name="Otro")
    if declaracion is None:
        del cuerpo["truthful_declaration"]
    else:
        cuerpo["truthful_declaration"] = declaracion

    respuesta = await client.patch(f"/guardians/me/students/{student_id}", json=cuerpo, headers=_headers(token))

    assert respuesta.status_code == 422
    ver = await client.get(f"/guardians/me/students/{student_id}", headers=_headers(token))
    assert ver.json()["first_name"] == "Sofía"
    assert await _cambios_registrados() == []


async def test_la_condicion_otra_exige_que_se_especifique(client: AsyncClient) -> None:
    token, student_id = await _tutor_con_peque(client, "peque-otra@example.com", "8000000020")
    url = f"/guardians/me/students/{student_id}"

    sin_texto = await client.patch(url, json=_datos(support_condition_ids=[SUPPORT_CONDITION_ID_OTRA]), headers=_headers(token))
    texto_sin_otra = await client.patch(url, json=_datos(support_condition_other="Algo"), headers=_headers(token))
    con_texto = await client.patch(
        url,
        json=_datos(support_condition_ids=[SUPPORT_CONDITION_ID_OTRA], support_condition_other="Baja visión"),
        headers=_headers(token),
    )

    assert sin_texto.status_code == 422
    assert sin_texto.json()["error"]["code"] == "condicion_apoyo_invalida"
    assert texto_sin_otra.status_code == 422
    assert con_texto.status_code == 200
    assert con_texto.json()["support_condition_other"] == "Baja visión"


async def test_la_fecha_de_nacimiento_de_un_peque_no_puede_ser_futura(client: AsyncClient) -> None:
    token, student_id = await _tutor_con_peque(client, "peque-futuro@example.com", "8000000021")

    respuesta = await client.patch(
        f"/guardians/me/students/{student_id}", json=_datos(date_of_birth="2999-01-01"), headers=_headers(token)
    )

    assert respuesta.status_code == 422


async def test_editar_un_peque_registra_que_campos_cambiaron_sin_sus_valores(client: AsyncClient) -> None:
    token, student_id = await _tutor_con_peque(client, "peque-registro@example.com", "8000000022")

    await client.patch(
        f"/guardians/me/students/{student_id}",
        json=_datos(last_name="Gómez", additional_support_need="Usa gafas"),
        headers=_headers(token),
    )

    cambios = await _cambios_registrados()
    assert len(cambios) == 1
    cambio = cambios[0]
    assert str(cambio.student_id) == student_id
    assert cambio.changed_fields == ["last_name", "additional_support_need"]
    assert cambio.declaration_version == PROFILE_DECLARATION_VERSION
    guardado = str([cambio.changed_fields, cambio.declaration_version, cambio.session_id])
    for valor in ("Gómez", "Pérez", "Usa gafas"):
        assert valor not in guardado


async def test_guardar_un_peque_sin_cambiar_nada_no_registra_nada(client: AsyncClient) -> None:
    token, student_id = await _tutor_con_peque(client, "peque-sin-cambios@example.com", "8000000023")

    respuesta = await client.patch(f"/guardians/me/students/{student_id}", json=_datos(), headers=_headers(token))

    assert respuesta.status_code == 200
    assert await _cambios_registrados() == []


async def test_eliminar_la_cuenta_borra_el_registro_de_cambios_de_sus_peques(client: AsyncClient) -> None:
    token, student_id = await _tutor_con_peque(client, "peque-borrar@example.com", "8000000024")
    await client.patch(f"/guardians/me/students/{student_id}", json=_datos(last_name="Gómez"), headers=_headers(token))
    assert len(await _cambios_registrados()) == 1

    respuesta = await client.request("DELETE", "/guardians/me", json={"password": "Clave-Segura-123"}, headers=_headers(token))

    assert respuesta.status_code == 204
    assert await _cambios_registrados() == []


# --- PUT /guardians/me/students/{id}/pin ---


async def test_cambiar_el_pin_de_un_peque_deja_entrar_solo_con_el_nuevo(client: AsyncClient) -> None:
    token, student_id, secret = await _tutor_con_peque_y_secreto(client, "peque-pin@example.com", "8000000014")

    respuesta = await client.put(f"/guardians/me/students/{student_id}/pin", json=_pin(secret), headers=_headers(token))

    assert respuesta.status_code == 204
    assert (await _entrar_con_pin(client, token, student_id, "1234")).status_code == 401
    assert (await _entrar_con_pin(client, token, student_id, "9876")).status_code == 200
    # The PIN is not profile data, so it leaves no row there.
    assert await _cambios_registrados() == []


async def test_cambiar_el_pin_cierra_las_sesiones_abiertas_del_peque(client: AsyncClient) -> None:
    token, student_id, secret = await _tutor_con_peque_y_secreto(client, "peque-pin-sesion@example.com", "8000000015")
    sesion = await _entrar_con_pin(client, token, student_id, "1234")
    token_peque = sesion.json()["access_token"]
    # A kid has no account data, so an open session answers 404 here, not 401.
    assert (await client.get("/users/me", headers=_headers(token_peque))).status_code == 404

    await client.put(f"/guardians/me/students/{student_id}/pin", json=_pin(secret), headers=_headers(token))

    assert (await client.get("/users/me", headers=_headers(token_peque))).status_code == 401
    # The guardian's own session stays open.
    assert (await client.get("/guardians/me/students", headers=_headers(token))).status_code == 200


async def test_cambiar_el_pin_con_el_actual_incorrecto_no_cambia_nada(client: AsyncClient) -> None:
    token, student_id, secret = await _tutor_con_peque_y_secreto(client, "peque-pin-actual@example.com", "8000000016")

    respuesta = await client.put(
        f"/guardians/me/students/{student_id}/pin", json=_pin(secret, actual="0000"), headers=_headers(token)
    )

    assert respuesta.status_code == 422
    assert respuesta.json()["error"]["code"] == "pin_actual_incorrecto"
    assert (await _entrar_con_pin(client, token, student_id, "1234")).status_code == 200


async def test_el_codigo_sirve_de_nuevo_si_el_pin_actual_estaba_mal(client: AsyncClient) -> None:
    token, student_id, secret = await _tutor_con_peque_y_secreto(client, "peque-pin-reintento@example.com", "8000000021")
    ruta = f"/guardians/me/students/{student_id}/pin"
    codigo = pyotp.TOTP(secret).now()

    malo = await client.put(ruta, json=_pin(secret, actual="0000", code=codigo), headers=_headers(token))
    bueno = await client.put(ruta, json=_pin(secret, code=codigo), headers=_headers(token))
    repetido = await client.put(ruta, json=_pin(secret, nuevo="5555", actual="9876", code=codigo), headers=_headers(token))

    assert malo.status_code == 422
    assert bueno.status_code == 204
    # Once it changed a PIN, the same code doesn't work a second time.
    assert repetido.status_code == 401


async def test_los_pin_actuales_equivocados_bloquean_el_cambio_pero_no_el_ingreso_del_peque(client: AsyncClient) -> None:
    token, student_id, secret = await _tutor_con_peque_y_secreto(client, "peque-pin-espera@example.com", "8000000022")
    ruta = f"/guardians/me/students/{student_id}/pin"
    for _ in range(10):
        intento = await client.put(ruta, json=_pin(secret, actual="0000"), headers=_headers(token))
        if intento.status_code == 429:
            break

    assert intento.status_code == 429
    # Not even the right PIN gets through while it waits.
    assert (await client.put(ruta, json=_pin(secret), headers=_headers(token))).status_code == 429
    assert (await _entrar_con_pin(client, token, student_id, "1234")).status_code == 200


async def test_cambiar_el_pin_con_codigo_incorrecto_no_cambia_nada(client: AsyncClient) -> None:
    token, student_id, secret = await _tutor_con_peque_y_secreto(client, "peque-pin-codigo@example.com", "8000000023")

    respuesta = await client.put(
        f"/guardians/me/students/{student_id}/pin",
        json=_pin(secret, code=_codigo_incorrecto(secret)),
        headers=_headers(token),
    )

    assert respuesta.status_code == 401
    assert respuesta.json()["error"]["code"] == "codigo_totp_invalido"
    assert (await _entrar_con_pin(client, token, student_id, "1234")).status_code == 200


@pytest.mark.parametrize(
    "cambios",
    [
        {"pin": "123", "pin_confirmation": "123"},
        {"pin": "12345", "pin_confirmation": "12345"},
        {"pin": "12a4", "pin_confirmation": "12a4"},
        {"pin_confirmation": "4321"},
        # Same as the current one.
        {"pin": "1234", "pin_confirmation": "1234"},
        {"current_pin": ""},
        {"code": ""},
    ],
)
async def test_un_cambio_de_pin_invalido_no_se_guarda(client: AsyncClient, cambios: dict[str, str]) -> None:
    token, student_id, secret = await _tutor_con_peque_y_secreto(client, "peque-pin-malo@example.com", "8000000017")

    respuesta = await client.put(
        f"/guardians/me/students/{student_id}/pin", json=_pin(secret, **cambios), headers=_headers(token)
    )

    assert respuesta.status_code == 422
    assert (await _entrar_con_pin(client, token, student_id, "1234")).status_code == 200


async def test_no_se_puede_cambiar_el_pin_del_peque_de_otro_tutor(client: AsyncClient) -> None:
    token_dueno, student_id, _ = await _tutor_con_peque_y_secreto(client, "peque-pin-dueno@example.com", "8000000018")
    token_otro, _, secret_otro = await _tutor_con_peque_y_secreto(client, "peque-pin-otro@example.com", "8000000019")

    respuesta = await client.put(
        f"/guardians/me/students/{student_id}/pin", json=_pin(secret_otro), headers=_headers(token_otro)
    )

    assert respuesta.status_code == 404
    assert (await _entrar_con_pin(client, token_dueno, student_id, "1234")).status_code == 200


async def test_cambiar_el_pin_no_depende_del_acceso_al_portal(client: AsyncClient) -> None:
    correo = "peque-pin-cerrado@example.com"
    _token, student_id, secret = await _tutor_con_peque_y_secreto(client, correo, "8000000020")
    # A second session of the same guardian, that never opened the portal.
    # The code and the current PIN sent with the change are enough.
    login = await client.post("/auth/login", json={"email": correo, "password": "Clave-Segura-123"})
    otra_sesion = login.json()["access_token"]

    respuesta = await client.put(
        f"/guardians/me/students/{student_id}/pin", json=_pin(secret), headers=_headers(otra_sesion)
    )

    assert respuesta.status_code == 204


# --- POST /guardians/me/students/{id}/pin/check ---


async def test_comprobar_el_pin_actual_dice_si_es_correcto_sin_cambiar_nada(client: AsyncClient) -> None:
    token, student_id = await _tutor_con_peque(client, "peque-pin-comprobar@example.com", "8000000024")
    ruta = f"/guardians/me/students/{student_id}/pin/check"

    correcto = await client.post(ruta, json={"current_pin": "1234"}, headers=_headers(token))
    equivocado = await client.post(ruta, json={"current_pin": "0000"}, headers=_headers(token))

    assert correcto.status_code == 204
    assert equivocado.status_code == 422
    assert equivocado.json()["error"]["code"] == "pin_actual_incorrecto"
    assert (await _entrar_con_pin(client, token, student_id, "1234")).status_code == 200


async def test_comprobar_muchos_pin_equivocados_obliga_a_esperar(client: AsyncClient) -> None:
    token, student_id = await _tutor_con_peque(client, "peque-pin-comprobar-espera@example.com", "8000000025")
    ruta = f"/guardians/me/students/{student_id}/pin/check"
    for _ in range(10):
        intento = await client.post(ruta, json={"current_pin": "0000"}, headers=_headers(token))
        if intento.status_code == 429:
            break

    assert intento.status_code == 429
    # Not even the right PIN is answered while it waits.
    assert (await client.post(ruta, json={"current_pin": "1234"}, headers=_headers(token))).status_code == 429


async def test_comprobar_el_pin_exige_el_acceso_al_portal(client: AsyncClient) -> None:
    correo = "peque-pin-comprobar-cerrado@example.com"
    _token, student_id = await _tutor_con_peque(client, correo, "8000000026")
    login = await client.post("/auth/login", json={"email": correo, "password": "Clave-Segura-123"})
    otra_sesion = login.json()["access_token"]

    respuesta = await client.post(
        f"/guardians/me/students/{student_id}/pin/check", json={"current_pin": "1234"}, headers=_headers(otra_sesion)
    )

    assert respuesta.status_code == 403
    assert respuesta.json()["error"]["code"] == "acceso_portal_requerido"


async def test_no_se_puede_comprobar_el_pin_del_peque_de_otro_tutor(client: AsyncClient) -> None:
    _dueno, student_id = await _tutor_con_peque(client, "peque-pin-comprobar-dueno@example.com", "8000000027")
    token_otro, _ = await _tutor_con_peque(client, "peque-pin-comprobar-otro@example.com", "8000000028")

    respuesta = await client.post(
        f"/guardians/me/students/{student_id}/pin/check", json={"current_pin": "1234"}, headers=_headers(token_otro)
    )

    assert respuesta.status_code == 404


# --- Several support conditions on the same kid ---

SUPPORT_CONDITION_ID_MIELOMENINGOCELE = 3
SUPPORT_CONDITION_ID_ARNOLD_CHIARI = 4


async def test_un_peque_puede_tener_varias_condiciones(client: AsyncClient) -> None:
    token, student_id = await _tutor_con_peque(client, "peque-varias@example.com", "8000000030")
    url = f"/guardians/me/students/{student_id}"
    # Sent out of order on purpose.
    varias = [SUPPORT_CONDITION_ID_ARNOLD_CHIARI, SUPPORT_CONDITION_ID_PARALISIS_CEREBRAL, SUPPORT_CONDITION_ID_MIELOMENINGOCELE]

    respuesta = await client.patch(url, json=_datos(support_condition_ids=varias), headers=_headers(token))

    assert respuesta.status_code == 200
    assert respuesta.json()["support_condition_ids"] == sorted(varias)
    relectura = await client.get(url, headers=_headers(token))
    assert relectura.json()["support_condition_ids"] == sorted(varias)
    cambios = await _cambios_registrados()
    assert [c.changed_fields for c in cambios] == [["support_condition_ids"]]


async def test_quitar_y_agregar_condiciones_deja_solo_las_elegidas(client: AsyncClient) -> None:
    token, student_id = await _tutor_con_peque(client, "peque-quitar@example.com", "8000000031")
    url = f"/guardians/me/students/{student_id}"
    primeras = [SUPPORT_CONDITION_ID_PARALISIS_CEREBRAL, SUPPORT_CONDITION_ID_MIELOMENINGOCELE]
    despues = [SUPPORT_CONDITION_ID_MIELOMENINGOCELE, SUPPORT_CONDITION_ID_ARNOLD_CHIARI]

    await client.patch(url, json=_datos(support_condition_ids=primeras), headers=_headers(token))
    respuesta = await client.patch(url, json=_datos(support_condition_ids=despues), headers=_headers(token))

    assert respuesta.status_code == 200
    relectura = await client.get(url, headers=_headers(token))
    assert relectura.json()["support_condition_ids"] == despues
    # The same ones in another order are not a change.
    igual = await client.patch(url, json=_datos(support_condition_ids=despues[::-1]), headers=_headers(token))
    assert igual.status_code == 200
    assert len(await _cambios_registrados()) == 2


async def test_otra_condicion_se_puede_combinar_con_las_del_catalogo(client: AsyncClient) -> None:
    token, student_id = await _tutor_con_peque(client, "peque-otra-mas@example.com", "8000000032")
    url = f"/guardians/me/students/{student_id}"
    ids = [SUPPORT_CONDITION_ID_PARALISIS_CEREBRAL, SUPPORT_CONDITION_ID_OTRA]

    sin_texto = await client.patch(url, json=_datos(support_condition_ids=ids), headers=_headers(token))
    con_texto = await client.patch(
        url, json=_datos(support_condition_ids=ids, support_condition_other="Baja visión"), headers=_headers(token)
    )

    assert sin_texto.status_code == 422
    assert con_texto.status_code == 200
    assert con_texto.json()["support_condition_ids"] == ids
    assert con_texto.json()["support_condition_other"] == "Baja visión"


@pytest.mark.parametrize(
    "ids",
    [
        # "Prefiero no especificar" goes alone.
        [SUPPORT_CONDITION_ID_PARALISIS_CEREBRAL, SUPPORT_CONDITION_ID_PREFIERO_NO_ESPECIFICAR],
        [SUPPORT_CONDITION_ID_PARALISIS_CEREBRAL, SUPPORT_CONDITION_ID_PARALISIS_CEREBRAL],
        [SUPPORT_CONDITION_ID_PARALISIS_CEREBRAL, 9999],
        [],
        [0],
        SUPPORT_CONDITION_ID_PARALISIS_CEREBRAL,
    ],
)
async def test_una_lista_de_condiciones_invalida_no_se_guarda(client: AsyncClient, ids: object) -> None:
    token, student_id = await _tutor_con_peque(client, "peque-lista-mala@example.com", "8000000033")
    url = f"/guardians/me/students/{student_id}"

    respuesta = await client.patch(url, json=_datos(support_condition_ids=ids), headers=_headers(token))

    assert respuesta.status_code == 422
    relectura = await client.get(url, headers=_headers(token))
    assert relectura.json()["support_condition_ids"] == [SUPPORT_CONDITION_ID_PREFIERO_NO_ESPECIFICAR]
    assert await _cambios_registrados() == []


async def test_el_registro_acepta_varias_condiciones_para_el_peque(client: AsyncClient) -> None:
    payload = payload_registro_tutor("registro-varias@example.com", "8000000034")
    payload["student"]["support_condition_ids"] = [SUPPORT_CONDITION_ID_ARNOLD_CHIARI, SUPPORT_CONDITION_ID_MIELOMENINGOCELE]

    registro = await client.post("/auth/guardians", json=payload)

    assert registro.status_code == 201
    token = registro.json()["access_token"]
    await activar_2fa_y_abrir_portal(client, token)
    lista = await client.get("/guardians/me/students", headers=_headers(token))
    detalle = await client.get(f"/guardians/me/students/{lista.json()[0]['id']}", headers=_headers(token))
    assert detalle.json()["support_condition_ids"] == [SUPPORT_CONDITION_ID_MIELOMENINGOCELE, SUPPORT_CONDITION_ID_ARNOLD_CHIARI]


async def test_el_registro_rechaza_prefiero_no_especificar_junto_a_otra_condicion(client: AsyncClient) -> None:
    payload = payload_registro_tutor("registro-contradice@example.com", "8000000035")
    payload["student"]["support_condition_ids"] = [
        SUPPORT_CONDITION_ID_PARALISIS_CEREBRAL,
        SUPPORT_CONDITION_ID_PREFIERO_NO_ESPECIFICAR,
    ]

    registro = await client.post("/auth/guardians", json=payload)

    assert registro.status_code == 422
    assert registro.json()["error"]["code"] == "condicion_apoyo_invalida"
