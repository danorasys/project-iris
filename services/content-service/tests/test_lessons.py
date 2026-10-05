from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient

from tests.fakes import FakeClassroomClient, FakeIdentityClient, FakeObjectStorage

PNG = b"\x89PNG\r\n\x1a\n" + b"datos-de-prueba"
JPEG = b"\xff\xd8\xff" + b"datos-de-prueba"

pytestmark = pytest.mark.asyncio


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_happy_path_create_lesson_upload_image_insert_it_and_see_it_in_detail(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    classroom_id = uuid4()
    teacher_id = uuid4()
    identity_client.register("token-docente", teacher_id, "teacher")
    classroom_client.authorize(classroom_id, teacher_id, "teacher", authorized=True)

    resp_create = await client.post(
        f"/classrooms/{classroom_id}/lessons",
        json={"title": "Sumas y restas", "blocks": [{"type": "texto", "content": "Bienvenida", "order_index": 0}]},
        headers=_auth("token-docente"),
    )
    assert resp_create.status_code == 201
    lesson = resp_create.json()
    assert lesson["status"] == "borrador"
    assert len(lesson["blocks"]) == 1
    lesson_id = lesson["id"]

    resp_image = await client.post(
        f"/lessons/{lesson_id}/images",
        files={"file": ("figura.png", PNG, "image/png")},
        headers=_auth("token-docente"),
    )
    assert resp_image.status_code == 201
    image_file = resp_image.json()["image_file"]
    # Only a file name comes back, never a storage URL.
    assert image_file.endswith(".png")
    assert "/" not in image_file

    resp_patch = await client.patch(
        f"/lessons/{lesson_id}",
        json={
            "status": "publicada",
            "blocks": [
                {"type": "texto", "content": "Bienvenida", "order_index": 0},
                {"type": "imagen", "image_file": image_file, "order_index": 1},
            ],
        },
        headers=_auth("token-docente"),
    )
    assert resp_patch.status_code == 200
    assert resp_patch.json()["status"] == "publicada"

    resp_detail = await client.get(f"/lessons/{lesson_id}", headers=_auth("token-docente"))
    assert resp_detail.status_code == 200
    detail = resp_detail.json()
    assert detail["status"] == "publicada"
    assert [b["order_index"] for b in detail["blocks"]] == [0, 1]
    assert detail["blocks"][1]["image_file"] == image_file


async def test_create_lesson_requires_being_the_owning_teacher_of_the_classroom(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    classroom_id = uuid4()
    teacher_id = uuid4()
    identity_client.register("token-docente", teacher_id, "teacher")
    classroom_client.authorize(classroom_id, teacher_id, "teacher", authorized=False)

    resp = await client.post(
        f"/classrooms/{classroom_id}/lessons",
        json={"title": "Aula ajena", "blocks": []},
        headers=_auth("token-docente"),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "permiso_denegado"


async def test_student_cannot_create_lessons(client: AsyncClient, identity_client: FakeIdentityClient) -> None:
    classroom_id = uuid4()
    student_id = uuid4()
    identity_client.register("token-estudiante", student_id, "student")

    resp = await client.post(
        f"/classrooms/{classroom_id}/lessons",
        json={"title": "No debería poder", "blocks": []},
        headers=_auth("token-estudiante"),
    )
    assert resp.status_code == 403


async def test_unenrolled_student_cannot_see_lessons(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    classroom_id = uuid4()
    student_id = uuid4()
    identity_client.register("token-estudiante", student_id, "student")
    # no classroom_client.authorize(...) call, so it's unauthorized by default

    resp = await client.get(f"/classrooms/{classroom_id}/lessons", headers=_auth("token-estudiante"))
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "permiso_denegado"


async def test_accessing_a_lesson_from_another_classroom_returns_403(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    classroom_id = uuid4()
    teacher_a = uuid4()
    teacher_b = uuid4()
    identity_client.register("token-a", teacher_a, "teacher")
    identity_client.register("token-b", teacher_b, "teacher")
    classroom_client.authorize(classroom_id, teacher_a, "teacher", authorized=True)

    resp_create = await client.post(
        f"/classrooms/{classroom_id}/lessons", json={"title": "Lección de A", "blocks": []}, headers=_auth("token-a")
    )
    lesson_id = resp_create.json()["id"]

    resp_b = await client.get(f"/lessons/{lesson_id}", headers=_auth("token-b"))
    assert resp_b.status_code == 403
    assert resp_b.json()["error"]["code"] == "permiso_denegado"


async def test_owning_teacher_can_edit_and_another_teacher_cannot(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    classroom_id = uuid4()
    teacher_a = uuid4()
    teacher_b = uuid4()
    identity_client.register("token-a", teacher_a, "teacher")
    identity_client.register("token-b", teacher_b, "teacher")
    classroom_client.authorize(classroom_id, teacher_a, "teacher", authorized=True)

    resp_create = await client.post(
        f"/classrooms/{classroom_id}/lessons", json={"title": "Original", "blocks": []}, headers=_auth("token-a")
    )
    lesson_id = resp_create.json()["id"]

    resp_b = await client.patch(f"/lessons/{lesson_id}", json={"title": "Hackeado"}, headers=_auth("token-b"))
    assert resp_b.status_code == 403

    resp_a = await client.patch(f"/lessons/{lesson_id}", json={"title": "Actualizado"}, headers=_auth("token-a"))
    assert resp_a.status_code == 200
    assert resp_a.json()["title"] == "Actualizado"


async def test_classroom_service_down_during_verification_returns_403_fail_closed(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    classroom_id = uuid4()
    student_id = uuid4()
    identity_client.register("token-estudiante", student_id, "student")
    classroom_client.authorize(classroom_id, student_id, "student", authorized=True)
    classroom_client.available = False  # simulates classroom-service being down

    resp = await client.get(f"/classrooms/{classroom_id}/lessons", headers=_auth("token-estudiante"))
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "permiso_denegado"


async def test_identity_service_down_returns_503(client: AsyncClient, identity_client: FakeIdentityClient) -> None:
    identity_client.available = False

    resp = await client.get(f"/classrooms/{uuid4()}/lessons", headers=_auth("cualquier-token"))
    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "autenticacion_no_disponible"


async def test_missing_token_returns_401(client: AsyncClient) -> None:
    resp = await client.get(f"/classrooms/{uuid4()}/lessons")
    assert resp.status_code == 401


async def test_owning_teacher_sees_draft_and_published_student_sees_only_published(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    classroom_id = uuid4()
    teacher_id = uuid4()
    student_id = uuid4()
    identity_client.register("token-docente", teacher_id, "teacher")
    identity_client.register("token-estudiante", student_id, "student")
    classroom_client.authorize(classroom_id, teacher_id, "teacher", authorized=True)
    classroom_client.authorize(classroom_id, student_id, "student", authorized=True)

    await client.post(
        f"/classrooms/{classroom_id}/lessons", json={"title": "Borrador", "blocks": []}, headers=_auth("token-docente")
    )
    resp_create_2 = await client.post(
        f"/classrooms/{classroom_id}/lessons", json={"title": "Publicada", "blocks": []}, headers=_auth("token-docente")
    )
    published_lesson_id = resp_create_2.json()["id"]
    await client.patch(
        f"/lessons/{published_lesson_id}", json={"status": "publicada"}, headers=_auth("token-docente")
    )

    resp_teacher = await client.get(f"/classrooms/{classroom_id}/lessons", headers=_auth("token-docente"))
    assert resp_teacher.status_code == 200
    assert len(resp_teacher.json()) == 2

    resp_student = await client.get(f"/classrooms/{classroom_id}/lessons", headers=_auth("token-estudiante"))
    assert resp_student.status_code == 200
    student_lessons = resp_student.json()
    assert len(student_lessons) == 1
    assert student_lessons[0]["status"] == "publicada"


async def test_student_does_not_see_draft_lesson_by_id(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    classroom_id = uuid4()
    teacher_id = uuid4()
    student_id = uuid4()
    identity_client.register("token-docente", teacher_id, "teacher")
    identity_client.register("token-estudiante", student_id, "student")
    classroom_client.authorize(classroom_id, teacher_id, "teacher", authorized=True)
    classroom_client.authorize(classroom_id, student_id, "student", authorized=True)

    resp_create = await client.post(
        f"/classrooms/{classroom_id}/lessons", json={"title": "Sin publicar", "blocks": []}, headers=_auth("token-docente")
    )
    lesson_id = resp_create.json()["id"]

    resp = await client.get(f"/lessons/{lesson_id}", headers=_auth("token-estudiante"))
    assert resp.status_code == 404


async def test_image_with_invalid_content_type_is_rejected(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    classroom_id = uuid4()
    teacher_id = uuid4()
    identity_client.register("token-docente", teacher_id, "teacher")
    classroom_client.authorize(classroom_id, teacher_id, "teacher", authorized=True)

    resp_create = await client.post(
        f"/classrooms/{classroom_id}/lessons", json={"title": "Con imagen mala", "blocks": []}, headers=_auth("token-docente")
    )
    lesson_id = resp_create.json()["id"]

    resp = await client.post(
        f"/lessons/{lesson_id}/images",
        files={"file": ("documento.pdf", b"no es una imagen", "application/pdf")},
        headers=_auth("token-docente"),
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "archivo_invalido"


async def test_image_svg_is_rejected(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    # An SVG can carry a <script> tag and gets served back with the same
    # content type, so it's excluded even though it technically starts with
    # "image/".
    classroom_id = uuid4()
    teacher_id = uuid4()
    identity_client.register("token-docente", teacher_id, "teacher")
    classroom_client.authorize(classroom_id, teacher_id, "teacher", authorized=True)

    resp_create = await client.post(
        f"/classrooms/{classroom_id}/lessons", json={"title": "Con SVG", "blocks": []}, headers=_auth("token-docente")
    )
    lesson_id = resp_create.json()["id"]

    resp = await client.post(
        f"/lessons/{lesson_id}/images",
        files={"file": ("logo.svg", b"<svg onload='alert(1)'></svg>", "image/svg+xml")},
        headers=_auth("token-docente"),
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "archivo_invalido"


async def test_image_too_large_is_rejected(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    classroom_id = uuid4()
    teacher_id = uuid4()
    identity_client.register("token-docente", teacher_id, "teacher")
    classroom_client.authorize(classroom_id, teacher_id, "teacher", authorized=True)

    resp_create = await client.post(
        f"/classrooms/{classroom_id}/lessons", json={"title": "Con imagen grande", "blocks": []}, headers=_auth("token-docente")
    )
    lesson_id = resp_create.json()["id"]

    large_content = PNG + b"0" * (5 * 1024 * 1024)
    resp = await client.post(
        f"/lessons/{lesson_id}/images",
        files={"file": ("grande.png", large_content, "image/png")},
        headers=_auth("token-docente"),
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "archivo_invalido"


async def test_health_live_and_ready(client: AsyncClient) -> None:
    resp_live = await client.get("/health/live")
    assert resp_live.status_code == 200

    resp_ready = await client.get("/health/ready")
    assert resp_ready.status_code == 200


# ---------------------------------------------------------------------------
# Lesson images: private, same access rule as the lesson
# ---------------------------------------------------------------------------


async def _published_lesson_with_image(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> tuple[UUID, str, str]:
    classroom_id = uuid4()
    teacher_id = uuid4()
    identity_client.register("token-docente", teacher_id, "teacher")
    classroom_client.authorize(classroom_id, teacher_id, "teacher", authorized=True)

    lesson = await client.post(
        f"/classrooms/{classroom_id}/lessons", json={"title": "Con imagen", "blocks": []}, headers=_auth("token-docente")
    )
    lesson_id = lesson.json()["id"]
    upload = await client.post(
        f"/lessons/{lesson_id}/images",
        files={"file": ("figura.png", PNG, "image/png")},
        headers=_auth("token-docente"),
    )
    image_file = upload.json()["image_file"]
    await client.patch(
        f"/lessons/{lesson_id}",
        json={"status": "publicada", "blocks": [{"type": "imagen", "image_file": image_file, "order_index": 0}]},
        headers=_auth("token-docente"),
    )
    return classroom_id, lesson_id, image_file


async def test_teacher_downloads_an_image_of_their_lesson(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    _classroom_id, lesson_id, image_file = await _published_lesson_with_image(client, identity_client, classroom_client)

    response = await client.get(f"/lessons/{lesson_id}/images/{image_file}", headers=_auth("token-docente"))

    # The service only answers with where Caddy has to fetch the file from.
    assert response.status_code == 200
    assert response.content == b""
    assert response.headers["x-iris-media"] == f"/test-bucket/lessons/{lesson_id}/images/{image_file}"
    assert response.headers["x-iris-media-authorization"].startswith("AWS4-HMAC-SHA256")
    assert response.headers["cache-control"] == "private, max-age=3600"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-security-policy"] == "default-src 'none'; sandbox"


async def test_enrolled_student_downloads_an_image_of_a_published_lesson(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    classroom_id, lesson_id, image_file = await _published_lesson_with_image(client, identity_client, classroom_client)
    student_id = uuid4()
    identity_client.register("token-estudiante", student_id, "student")
    classroom_client.authorize(classroom_id, student_id, "student", authorized=True)

    response = await client.get(f"/lessons/{lesson_id}/images/{image_file}", headers=_auth("token-estudiante"))

    assert response.status_code == 200
    assert response.headers["x-iris-media"] == f"/test-bucket/lessons/{lesson_id}/images/{image_file}"


async def test_student_outside_the_classroom_gets_404_not_403(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    _classroom_id, lesson_id, image_file = await _published_lesson_with_image(client, identity_client, classroom_client)
    identity_client.register("token-intruso", uuid4(), "student")

    response = await client.get(f"/lessons/{lesson_id}/images/{image_file}", headers=_auth("token-intruso"))

    # Same answer as an image that doesn't exist, so nothing leaks.
    assert response.status_code == 404


async def test_other_teacher_gets_404(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    _classroom_id, lesson_id, image_file = await _published_lesson_with_image(client, identity_client, classroom_client)
    identity_client.register("token-otro-docente", uuid4(), "teacher")

    response = await client.get(f"/lessons/{lesson_id}/images/{image_file}", headers=_auth("token-otro-docente"))

    assert response.status_code == 404


async def test_student_does_not_get_uploaded_images_the_lesson_does_not_show(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    classroom_id, lesson_id, _image_file = await _published_lesson_with_image(client, identity_client, classroom_client)
    leftover = await client.post(
        f"/lessons/{lesson_id}/images",
        files={"file": ("borrador.png", PNG + b"sin-usar", "image/png")},
        headers=_auth("token-docente"),
    )
    student_id = uuid4()
    identity_client.register("token-estudiante", student_id, "student")
    classroom_client.authorize(classroom_id, student_id, "student", authorized=True)

    response = await client.get(
        f"/lessons/{lesson_id}/images/{leftover.json()['image_file']}", headers=_auth("token-estudiante")
    )

    assert response.status_code == 404


async def test_image_without_a_session_is_401(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    _classroom_id, lesson_id, image_file = await _published_lesson_with_image(client, identity_client, classroom_client)

    response = await client.get(f"/lessons/{lesson_id}/images/{image_file}")

    assert response.status_code == 401


async def test_block_with_an_external_url_is_rejected(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    classroom_id = uuid4()
    teacher_id = uuid4()
    identity_client.register("token-docente", teacher_id, "teacher")
    classroom_client.authorize(classroom_id, teacher_id, "teacher", authorized=True)

    response = await client.post(
        f"/classrooms/{classroom_id}/lessons",
        json={
            "title": "Con enlace externo",
            "blocks": [{"type": "imagen", "image_file": "https://tracker.example/pixel.png", "order_index": 0}],
        },
        headers=_auth("token-docente"),
    )

    assert response.status_code == 422


async def test_uploaded_image_extension_comes_from_the_content_type(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    classroom_id = uuid4()
    teacher_id = uuid4()
    identity_client.register("token-docente", teacher_id, "teacher")
    classroom_client.authorize(classroom_id, teacher_id, "teacher", authorized=True)
    lesson = await client.post(
        f"/classrooms/{classroom_id}/lessons", json={"title": "Extension", "blocks": []}, headers=_auth("token-docente")
    )

    response = await client.post(
        f"/lessons/{lesson.json()['id']}/images",
        files={"file": ("foto.exe", JPEG, "image/jpeg")},
        headers=_auth("token-docente"),
    )

    assert response.status_code == 201
    assert response.json()["image_file"].endswith(".jpg")


async def test_file_that_is_not_an_image_is_rejected_even_if_it_says_png(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient,
    object_storage: FakeObjectStorage,
) -> None:
    classroom_id, lesson_id, _image_file = await _published_lesson_with_image(client, identity_client, classroom_client)
    files_before = set(object_storage.files)

    response = await client.post(
        f"/lessons/{lesson_id}/images",
        files={"file": ("figura.png", b"<html><script>alert(1)</script></html>", "image/png")},
        headers=_auth("token-docente"),
    )

    assert response.status_code == 422
    assert set(object_storage.files) == files_before


async def test_images_removed_from_a_lesson_are_deleted_from_storage(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient,
    object_storage: FakeObjectStorage,
) -> None:
    _classroom_id, lesson_id, image_file = await _published_lesson_with_image(client, identity_client, classroom_client)
    unsaved = await client.post(
        f"/lessons/{lesson_id}/images",
        files={"file": ("nueva.png", PNG + b"nueva", "image/png")},
        headers=_auth("token-docente"),
    )

    await client.patch(
        f"/lessons/{lesson_id}",
        json={"blocks": [{"type": "texto", "content": "Ahora solo texto", "order_index": 0}]},
        headers=_auth("token-docente"),
    )

    keys = set(object_storage.files)
    # The image the lesson stopped showing is gone...
    assert f"lessons/{lesson_id}/images/{image_file}" not in keys
    # ...but a fresh upload that was never in a block stays, the editor may still use it.
    assert f"lessons/{lesson_id}/images/{unsaved.json()['image_file']}" in keys


async def test_full_storage_answers_507(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient,
    object_storage: FakeObjectStorage,
) -> None:
    _classroom_id, lesson_id, _image_file = await _published_lesson_with_image(client, identity_client, classroom_client)
    object_storage.full = True

    response = await client.post(
        f"/lessons/{lesson_id}/images", files={"file": ("x.png", PNG, "image/png")}, headers=_auth("token-docente")
    )

    assert response.status_code == 507
    assert response.json()["error"]["code"] == "almacenamiento_lleno"


async def test_a_teacher_without_the_2fa_code_is_turned_away(
    client: AsyncClient, identity_client: FakeIdentityClient
) -> None:
    identity_client.register("token-docente", uuid4(), "teacher", mfa_verified=False)

    response = await client.get(f"/classrooms/{uuid4()}/lessons", headers=_auth("token-docente"))

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "verificacion_2fa_requerida"
