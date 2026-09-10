from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.config import get_settings
from tests.fakes import FakeIdentityGateway, FakeObjectStorage

pytestmark = pytest.mark.asyncio


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _crear_aula(client: AsyncClient, token: str, nombre: str = "Aula", descripcion: str = "d") -> dict:
    response = await client.post("/classrooms", json={"name": nombre, "description": descripcion}, headers=_auth(token))
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
    assert aula["logo_url"] is None


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
# Logo (S3/MinIO via FakeObjectStorage)
# ---------------------------------------------------------------------------


async def test_subir_logo(
    client: AsyncClient, identity_gateway: FakeIdentityGateway, object_storage: FakeObjectStorage
) -> None:
    token, _ = identity_gateway.registrar_docente()
    aula = await _crear_aula(client, token)

    response = await client.post(
        f"/classrooms/{aula['id']}/logo",
        headers=_auth(token),
        files={"file": ("logo.png", b"contenido-fake-png", "image/png")},
    )

    assert response.status_code == 200
    assert response.json()["logo_url"] is not None
    assert len(object_storage.archivos) == 1


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
    """SVG can carry a <script> tag and gets served back with the same
    content type, so it's excluded even though it technically starts with
    "image/"."""
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
