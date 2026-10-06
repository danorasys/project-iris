from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.config import get_settings
from tests.fakes import FakeIdentityGateway, FakeObjectStorage

PNG = b"\x89PNG\r\n\x1a\n" + b"datos-de-prueba"
JPEG = b"\xff\xd8\xff" + b"datos-de-prueba"

pytestmark = pytest.mark.asyncio


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _crear_aula(client: AsyncClient, token: str, nombre: str = "Aula", descripcion: str = "d") -> dict:
    response = await client.post("/classrooms", json={"name": nombre, "description": descripcion, "area": "mathematics", "grade": 3}, headers=_auth(token))
    assert response.status_code == 201
    return response.json()


# ---------------------------------------------------------------------------
# Teacher: create, list, detail, edit
# ---------------------------------------------------------------------------


async def test_crear_aula_devuelve_codigo_ingreso_y_logo_null(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token, _teacher_id = identity_gateway.registrar_docente()

    aula = await _crear_aula(client, token, "Matemáticas 3A", "Aula de prueba")

    assert len(aula["enrollment_code"]) == 7
    assert aula["enrollment_code"].isdigit()
    assert aula["logo_file"] is None


async def test_listar_aulas_docente(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    token, _ = identity_gateway.registrar_docente()
    await _crear_aula(client, token, "Aula 1")
    await _crear_aula(client, token, "Aula 2")

    response = await client.get("/classrooms", headers=_auth(token))

    assert response.status_code == 200
    assert len(response.json()) == 2


async def test_acceso_a_aula_ajena_es_rechazado_con_403(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token_a, _ = identity_gateway.registrar_docente()
    token_b, _ = identity_gateway.registrar_docente()
    aula = await _crear_aula(client, token_a, "Aula de A")

    response = await client.get(f"/classrooms/{aula['id']}", headers=_auth(token_b))

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "permiso_denegado"


async def test_patch_aula(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    token, _ = identity_gateway.registrar_docente()
    aula = await _crear_aula(client, token, "Original")

    response = await client.patch(f"/classrooms/{aula['id']}", json={"name": "Actualizada"}, headers=_auth(token))

    assert response.status_code == 200
    assert response.json()["name"] == "Actualizada"
    assert response.json()["description"] == "d"


async def test_tutor_no_puede_acceder_a_rutas_de_aula(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token = identity_gateway.registrar_tutor_token()

    response = await client.get("/classrooms", headers=_auth(token))

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "permiso_denegado"


# ---------------------------------------------------------------------------
# Logo (storage via FakeObjectStorage)
# ---------------------------------------------------------------------------


async def test_subir_logo(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, object_storage: FakeObjectStorage
) -> None:
    token, _ = identity_gateway.registrar_docente()
    aula = await _crear_aula(client, token)

    response = await client.post(
        f"/classrooms/{aula['id']}/logo",
        headers=_auth(token),
        files={"file": ("logo.png", PNG, "image/png")},
    )

    assert response.status_code == 200
    logo_file = response.json()["logo_file"]
    assert logo_file.endswith(".png")
    # The API never hands out a storage URL, only the file name.
    assert "/" not in logo_file
    assert len(object_storage.archivos) == 1


async def test_extension_del_logo_sale_del_content_type_no_del_nombre(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token, _ = identity_gateway.registrar_docente()
    aula = await _crear_aula(client, token)

    response = await client.post(
        f"/classrooms/{aula['id']}/logo",
        headers=_auth(token),
        files={"file": ("logo.exe", JPEG, "image/jpeg")},
    )

    assert response.status_code == 200
    assert response.json()["logo_file"].endswith(".jpg")


async def test_subir_logo_content_type_invalido_es_rechazado(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token, _ = identity_gateway.registrar_docente()
    aula = await _crear_aula(client, token)

    response = await client.post(
        f"/classrooms/{aula['id']}/logo",
        headers=_auth(token),
        files={"file": ("archivo.txt", b"no es una imagen", "text/plain")},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "archivo_invalido"


async def test_subir_logo_svg_es_rechazado(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    # SVG can carry a <script> tag and gets served back with the same
    # content type, so it's excluded even though it technically starts with
    # "image/".
    token, _ = identity_gateway.registrar_docente()
    aula = await _crear_aula(client, token)

    response = await client.post(
        f"/classrooms/{aula['id']}/logo",
        headers=_auth(token),
        files={"file": ("logo.svg", b"<svg onload='alert(1)'></svg>", "image/svg+xml")},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "archivo_invalido"


async def test_subir_logo_demasiado_grande_es_rechazado(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token, _ = identity_gateway.registrar_docente()
    aula = await _crear_aula(client, token)
    contenido_grande = b"0" * (5 * 1024 * 1024 + 1)

    response = await client.post(
        f"/classrooms/{aula['id']}/logo",
        headers=_auth(token),
        files={"file": ("logo.png", contenido_grande, "image/png")},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "archivo_invalido"


# ---------------------------------------------------------------------------
# Student: enrollment code, brute force, duplicates
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Logo download: private, same access rule as the classroom
# ---------------------------------------------------------------------------


async def _aula_con_logo(client: AsyncClient, token_docente: str) -> tuple[dict, str]:
    aula = await _crear_aula(client, token_docente)
    response = await client.post(
        f"/classrooms/{aula['id']}/logo",
        headers=_auth(token_docente),
        files={"file": ("logo.png", PNG, "image/png")},
    )
    assert response.status_code == 200
    return aula, response.json()["logo_file"]


async def _inscribir_y_aceptar(client: AsyncClient, aula: dict, token_docente: str, token_estudiante: str) -> None:
    ingreso = await client.post(
        "/classrooms/enroll", json={"enrollment_code": aula["enrollment_code"]}, headers=_auth(token_estudiante)
    )
    assert ingreso.status_code == 201
    resolver = await client.post(
        f"/classrooms/{aula['id']}/requests/{ingreso.json()['enrollment_id']}/resolve",
        json={"decision": "aceptar"},
        headers=_auth(token_docente),
    )
    assert resolver.status_code == 200


async def test_docente_dueno_descarga_el_logo(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    token, _ = identity_gateway.registrar_docente()
    aula, logo_file = await _aula_con_logo(client, token)

    response = await client.get(f"/classrooms/{aula['id']}/logo/{logo_file}", headers=_auth(token))

    # The service only answers with where Caddy has to fetch the file from.
    assert response.status_code == 200
    assert response.content == b""
    assert response.headers["x-iris-media"] == f"/test-bucket/classrooms/{aula['id']}/logo/{logo_file}"
    assert response.headers["x-iris-media-authorization"].startswith("AWS4-HMAC-SHA256")
    assert response.headers["cache-control"] == "private, max-age=3600"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-security-policy"] == "default-src 'none'; sandbox"


async def test_estudiante_aceptado_descarga_el_logo(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    token_docente, _ = identity_gateway.registrar_docente()
    token_estudiante, _ = identity_gateway.registrar_estudiante_token()
    aula, logo_file = await _aula_con_logo(client, token_docente)
    await _inscribir_y_aceptar(client, aula, token_docente, token_estudiante)

    response = await client.get(f"/classrooms/{aula['id']}/logo/{logo_file}", headers=_auth(token_estudiante))

    assert response.status_code == 200
    assert response.headers["x-iris-media"] == f"/test-bucket/classrooms/{aula['id']}/logo/{logo_file}"


async def test_estudiante_con_solicitud_pendiente_no_ve_el_logo(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token_docente, _ = identity_gateway.registrar_docente()
    token_estudiante, _ = identity_gateway.registrar_estudiante_token()
    aula, logo_file = await _aula_con_logo(client, token_docente)
    await client.post(
        "/classrooms/enroll", json={"enrollment_code": aula["enrollment_code"]}, headers=_auth(token_estudiante)
    )

    response = await client.get(f"/classrooms/{aula['id']}/logo/{logo_file}", headers=_auth(token_estudiante))

    assert response.status_code == 404


async def test_otro_docente_recibe_404_y_no_403(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    token_a, _ = identity_gateway.registrar_docente()
    token_b, _ = identity_gateway.registrar_docente()
    aula, logo_file = await _aula_con_logo(client, token_a)

    response = await client.get(f"/classrooms/{aula['id']}/logo/{logo_file}", headers=_auth(token_b))

    # Same answer as a logo that doesn't exist, so nothing leaks.
    assert response.status_code == 404


async def test_logo_sin_sesion_es_401(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    token, _ = identity_gateway.registrar_docente()
    aula, logo_file = await _aula_con_logo(client, token)

    response = await client.get(f"/classrooms/{aula['id']}/logo/{logo_file}")

    assert response.status_code == 401


async def test_tutor_no_descarga_logos(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    token_docente, _ = identity_gateway.registrar_docente()
    aula, logo_file = await _aula_con_logo(client, token_docente)

    response = await client.get(
        f"/classrooms/{aula['id']}/logo/{logo_file}", headers=_auth(identity_gateway.registrar_tutor_token())
    )

    assert response.status_code == 403


async def test_logo_anterior_deja_de_estar_disponible_al_cambiarlo(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token, _ = identity_gateway.registrar_docente()
    aula, logo_viejo = await _aula_con_logo(client, token)
    await client.post(
        f"/classrooms/{aula['id']}/logo",
        headers=_auth(token),
        files={"file": ("nuevo.png", PNG + b"nuevo", "image/png")},
    )

    response = await client.get(f"/classrooms/{aula['id']}/logo/{logo_viejo}", headers=_auth(token))

    assert response.status_code == 404


@pytest.mark.parametrize("file_name", ["..%2F..%2Fetc%2Fpasswd", "logo.png", "ABCDEF0123456789ABCDEF0123456789.png"])
async def test_nombre_de_logo_con_forma_invalida_es_rechazado(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, file_name: str
) -> None:
    token, _ = identity_gateway.registrar_docente()
    aula, _logo_file = await _aula_con_logo(client, token)

    response = await client.get(f"/classrooms/{aula['id']}/logo/{file_name}", headers=_auth(token))

    assert response.status_code in (404, 422)


async def test_archivo_que_no_es_imagen_es_rechazado_aunque_diga_png(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, object_storage: FakeObjectStorage
) -> None:
    token, _ = identity_gateway.registrar_docente()
    aula = await _crear_aula(client, token)

    response = await client.post(
        f"/classrooms/{aula['id']}/logo",
        headers=_auth(token),
        files={"file": ("logo.png", b"<html><script>alert(1)</script></html>", "image/png")},
    )

    assert response.status_code == 422
    assert object_storage.archivos == {}


async def test_cambiar_el_logo_borra_el_anterior_del_almacenamiento(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, object_storage: FakeObjectStorage
) -> None:
    token, _ = identity_gateway.registrar_docente()
    aula, _logo_viejo = await _aula_con_logo(client, token)

    await client.post(
        f"/classrooms/{aula['id']}/logo", headers=_auth(token), files={"file": ("nuevo.png", PNG + b"2", "image/png")}
    )

    # Only the new logo is left, the old file doesn't stay behind.
    assert len(object_storage.archivos) == 1


async def test_almacenamiento_lleno_responde_507(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, object_storage: FakeObjectStorage
) -> None:
    token, _ = identity_gateway.registrar_docente()
    aula = await _crear_aula(client, token)
    object_storage.lleno = True

    response = await client.post(
        f"/classrooms/{aula['id']}/logo", headers=_auth(token), files={"file": ("logo.png", PNG, "image/png")}
    )

    assert response.status_code == 507
    assert response.json()["error"]["code"] == "almacenamiento_lleno"


async def test_codigo_ingreso_invalido(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    token, _ = identity_gateway.registrar_estudiante_token()

    response = await client.post("/classrooms/enroll", json={"enrollment_code": "9999999"}, headers=_auth(token))

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "codigo_ingreso_invalido"


async def test_fuerza_bruta_ingresar_bloqueada(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    token, _ = identity_gateway.registrar_estudiante_token()
    maximo = get_settings().rate_limit_enrollment_max

    ultima = None
    for _ in range(maximo + 1):
        ultima = await client.post("/classrooms/enroll", json={"enrollment_code": "1234567"}, headers=_auth(token))

    assert ultima is not None
    assert ultima.status_code == 429
    assert ultima.json()["error"]["code"] == "limite_intentos_excedido"


async def test_solicitud_duplicada_pendiente_es_rechazada(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token_docente, _ = identity_gateway.registrar_docente()
    token_estudiante, _ = identity_gateway.registrar_estudiante_token()
    aula = await _crear_aula(client, token_docente)

    primero = await client.post(
        "/classrooms/enroll", json={"enrollment_code": aula["enrollment_code"]}, headers=_auth(token_estudiante)
    )
    assert primero.status_code == 201

    segundo = await client.post(
        "/classrooms/enroll", json={"enrollment_code": aula["enrollment_code"]}, headers=_auth(token_estudiante)
    )
    assert segundo.status_code == 409
    assert segundo.json()["error"]["code"] == "ya_inscrito_o_pendiente"


async def test_reactivar_solicitud_rechazada_no_duplica_fila(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token_docente, _ = identity_gateway.registrar_docente()
    token_estudiante, _ = identity_gateway.registrar_estudiante_token()
    aula = await _crear_aula(client, token_docente)

    ingreso1 = await client.post(
        "/classrooms/enroll", json={"enrollment_code": aula["enrollment_code"]}, headers=_auth(token_estudiante)
    )
    enrollment_id = ingreso1.json()["enrollment_id"]

    await client.post(
        f"/classrooms/{aula['id']}/requests/{enrollment_id}/resolve",
        json={"decision": "rechazar"},
        headers=_auth(token_docente),
    )

    ingreso2 = await client.post(
        "/classrooms/enroll", json={"enrollment_code": aula["enrollment_code"]}, headers=_auth(token_estudiante)
    )
    assert ingreso2.status_code == 201
    assert ingreso2.json()["enrollment_id"] == enrollment_id
    assert ingreso2.json()["status"] == "pendiente"


# ---------------------------------------------------------------------------
# Full happy path
# ---------------------------------------------------------------------------


async def test_flujo_feliz_completo(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    token_docente, _teacher_id = identity_gateway.registrar_docente()
    token_estudiante, student_id = identity_gateway.registrar_estudiante_token(nombres="Sofía")

    aula = await _crear_aula(client, token_docente, "Matemáticas", "3er grado")

    ingreso = await client.post(
        "/classrooms/enroll", json={"enrollment_code": aula["enrollment_code"]}, headers=_auth(token_estudiante)
    )
    assert ingreso.status_code == 201
    assert ingreso.json()["status"] == "pendiente"
    enrollment_id = ingreso.json()["enrollment_id"]

    solicitudes = await client.get(f"/classrooms/{aula['id']}/requests", headers=_auth(token_docente))
    assert solicitudes.status_code == 200
    body = solicitudes.json()
    assert len(body) == 1
    assert body[0]["enrollment_id"] == enrollment_id
    assert body[0]["student_first_name"] == "Sofía"
    assert body[0]["guardian_contact"] == "ana@example.com · 3001234567"

    resolver = await client.post(
        f"/classrooms/{aula['id']}/requests/{enrollment_id}/resolve",
        json={"decision": "aceptar"},
        headers=_auth(token_docente),
    )
    assert resolver.status_code == 200
    assert resolver.json()["status"] == "aceptada"

    mias = await client.get("/classrooms/mine", headers=_auth(token_estudiante))
    assert mias.status_code == 200
    assert len(mias.json()) == 1
    assert mias.json()[0]["id"] == aula["id"]

    detalle = await client.get(f"/classrooms/{aula['id']}", headers=_auth(token_docente))
    assert detalle.status_code == 200
    estudiantes = detalle.json()["students"]
    assert len(estudiantes) == 1
    assert estudiantes[0]["student_id"] == str(student_id)
    assert estudiantes[0]["status"] == "aceptada"


async def test_resolver_solicitud_rechazar(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    token_docente, _ = identity_gateway.registrar_docente()
    token_estudiante, _ = identity_gateway.registrar_estudiante_token()
    aula = await _crear_aula(client, token_docente)
    ingreso = await client.post(
        "/classrooms/enroll", json={"enrollment_code": aula["enrollment_code"]}, headers=_auth(token_estudiante)
    )
    enrollment_id = ingreso.json()["enrollment_id"]

    response = await client.post(
        f"/classrooms/{aula['id']}/requests/{enrollment_id}/resolve",
        json={"decision": "rechazar"},
        headers=_auth(token_docente),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "rechazada"


async def test_resolver_solicitud_ya_resuelta_es_rechazado(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token_docente, _ = identity_gateway.registrar_docente()
    token_estudiante, _ = identity_gateway.registrar_estudiante_token()
    aula = await _crear_aula(client, token_docente)
    ingreso = await client.post(
        "/classrooms/enroll", json={"enrollment_code": aula["enrollment_code"]}, headers=_auth(token_estudiante)
    )
    enrollment_id = ingreso.json()["enrollment_id"]

    await client.post(
        f"/classrooms/{aula['id']}/requests/{enrollment_id}/resolve",
        json={"decision": "aceptar"},
        headers=_auth(token_docente),
    )
    segunda = await client.post(
        f"/classrooms/{aula['id']}/requests/{enrollment_id}/resolve",
        json={"decision": "aceptar"},
        headers=_auth(token_docente),
    )

    assert segunda.status_code == 409
    assert segunda.json()["error"]["code"] == "solicitud_ya_resuelta"


# ---------------------------------------------------------------------------
# identity-service unavailable -> 503 (never treated as authenticated by default)
# ---------------------------------------------------------------------------


async def test_identity_service_no_disponible_devuelve_503(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    identity_gateway.fallar_con_no_disponible = True

    response = await client.get("/classrooms", headers=_auth("cualquier-token"))

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "identidad_no_disponible"


async def test_token_invalido_devuelve_401(client: AsyncClient) -> None:
    response = await client.get("/classrooms", headers=_auth("token-que-no-existe"))

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "token_invalido"


# ---------------------------------------------------------------------------
# Internal endpoint used by content-service
# ---------------------------------------------------------------------------


async def test_internal_acceso_docente_dueno(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    token, teacher_id = identity_gateway.registrar_docente()
    aula = await _crear_aula(client, token)

    response = await client.get(
        f"/internal/classrooms/{aula['id']}/access",
        params={"subject_id": str(teacher_id), "role": "teacher"},
        headers={"X-Internal-Key": get_settings().internal_service_key},
    )

    assert response.status_code == 200
    assert response.json()["authorized"] is True


async def test_internal_acceso_docente_no_dueno(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    token, _ = identity_gateway.registrar_docente()
    _token_b, otro_teacher_id = identity_gateway.registrar_docente()
    aula = await _crear_aula(client, token)

    response = await client.get(
        f"/internal/classrooms/{aula['id']}/access",
        params={"subject_id": str(otro_teacher_id), "role": "teacher"},
        headers={"X-Internal-Key": get_settings().internal_service_key},
    )

    assert response.status_code == 200
    assert response.json()["authorized"] is False


async def test_internal_acceso_aula_inexistente_es_404(client: AsyncClient) -> None:
    response = await client.get(
        "/internal/classrooms/00000000-0000-0000-0000-000000000000/access",
        params={"subject_id": "00000000-0000-0000-0000-000000000000", "role": "teacher"},
        headers={"X-Internal-Key": get_settings().internal_service_key},
    )

    assert response.status_code == 404


async def test_internal_acceso_requiere_clave_interna(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    token, _ = identity_gateway.registrar_docente()
    aula = await _crear_aula(client, token)

    response = await client.get(
        f"/internal/classrooms/{aula['id']}/access",
        params={"subject_id": "00000000-0000-0000-0000-000000000000", "role": "teacher"},
    )

    assert response.status_code == 401


async def test_internal_acceso_estudiante_pasa_a_autorizado_tras_aceptar(
    client: AsyncClient, identity_gateway: FakeIdentityGateway
) -> None:
    token_docente, _ = identity_gateway.registrar_docente()
    token_estudiante, student_id = identity_gateway.registrar_estudiante_token()
    aula = await _crear_aula(client, token_docente)
    ingreso = await client.post(
        "/classrooms/enroll", json={"enrollment_code": aula["enrollment_code"]}, headers=_auth(token_estudiante)
    )
    enrollment_id = ingreso.json()["enrollment_id"]

    pendiente = await client.get(
        f"/internal/classrooms/{aula['id']}/access",
        params={"subject_id": str(student_id), "role": "student"},
        headers={"X-Internal-Key": get_settings().internal_service_key},
    )
    assert pendiente.json()["authorized"] is False

    await client.post(
        f"/classrooms/{aula['id']}/requests/{enrollment_id}/resolve",
        json={"decision": "aceptar"},
        headers=_auth(token_docente),
    )

    aceptado = await client.get(
        f"/internal/classrooms/{aula['id']}/access",
        params={"subject_id": str(student_id), "role": "student"},
        headers={"X-Internal-Key": get_settings().internal_service_key},
    )
    assert aceptado.json()["authorized"] is True


async def test_health_live_y_ready(client: AsyncClient) -> None:
    live = await client.get("/health/live")
    assert live.status_code == 200

    ready = await client.get("/health/ready")
    assert ready.status_code == 200


async def test_un_docente_sin_el_codigo_2fa_no_entra(client: AsyncClient, identity_gateway: FakeIdentityGateway) -> None:
    token, _teacher_id = identity_gateway.registrar_docente(verificado=False)

    response = await client.get("/classrooms", headers=_auth(token))

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "verificacion_2fa_requerida"
