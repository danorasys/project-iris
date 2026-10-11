# The DBA goes with the unit (one of the MEN catalog of the class's area and
# grade, or the teacher's own) together with the points it works on of it:
# evidences and the teacher's own. Needed to publish only in the areas with
# DBA, and publishing never guesses the class if classroom-service doesn't
# say it.

from __future__ import annotations

from typing import Any

import pytest
from httpx import AsyncClient

from tests.fakes import FakeClassroomClient, FakeIdentityClient
from tests.helpers import COMPLETE_ACTIVITY, COMPLETE_PAGES, Teacher, auth, lesson, student, teacher, unit

pytestmark = pytest.mark.asyncio

NO_DBA = "Elige el DBA de la unidad “{}” o escribe uno propio."
WRONG_DBA = "El DBA de la unidad “{}” no es del área o del grado de la clase: elige otro."
NO_POINTS = "Marca al menos una evidencia de aprendizaje del DBA de la unidad “{}” o escribe una propia."
LIVING_THINGS = "natural_sciences-1-3"


async def _complete_lesson(client: AsyncClient, who: Teacher) -> dict[str, Any]:
    created = await lesson(client, who, (await unit(client, who))["id"])
    await client.patch(f"/lessons/{created['id']}", json={"blocks": COMPLETE_PAGES}, headers=auth(who.token))
    await client.put(f"/lessons/{created['id']}/activity", json=COMPLETE_ACTIVITY, headers=auth(who.token))
    return created


def _natural_sciences_first_grade(classroom_client: FakeClassroomClient, who: Teacher) -> None:
    classroom_client.areas[who.classroom_id] = "natural_sciences"
    classroom_client.grades[who.classroom_id] = 1


async def test_el_catalogo_de_la_clase_trae_los_dba_de_su_area_y_grado(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    _natural_sciences_first_grade(classroom_client, who)

    response = await client.get(f"/classrooms/{who.classroom_id}/dba", headers=auth(who.token))

    assert response.status_code == 200, response.text
    catalog = response.json()
    assert [d["id"] for d in catalog] == [f"natural_sciences-1-{n}" for n in (1, 2, 3, 4)]
    living = catalog[2]
    assert (living["subject"], living["grade"], living["number"]) == ("natural_sciences", 1, 3)
    assert living["name"] == "Seres vivos y objetos sin vida"
    assert [e["id"] for e in living["evidences"]] == [f"{LIVING_THINGS}-{n}" for n in (1, 2, 3, 4)]


async def test_en_humanidades_trae_los_de_lenguaje_y_los_de_ingles(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    classroom_client.areas[who.classroom_id] = "humanities"
    classroom_client.grades[who.classroom_id] = 2

    catalog = (await client.get(f"/classrooms/{who.classroom_id}/dba", headers=auth(who.token))).json()

    subjects = [d["subject"] for d in catalog]
    assert subjects.count("language") == 8
    assert subjects.count("english") == 4
    # The MEN's English document has no evidences: only the teacher's points.
    assert all(d["evidences"] == [] for d in catalog if d["subject"] == "english")


async def test_un_area_sin_dba_no_tiene_catalogo_y_solo_lo_ve_su_docente(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    other = teacher(identity_client, classroom_client)
    _, kid_token = student(identity_client, classroom_client, who.classroom_id)

    arts = await client.get(f"/classrooms/{who.classroom_id}/dba", headers=auth(who.token))
    by_other = await client.get(f"/classrooms/{who.classroom_id}/dba", headers=auth(other.token))
    by_kid = await client.get(f"/classrooms/{who.classroom_id}/dba", headers=auth(kid_token))

    assert arts.json() == []
    assert by_other.status_code == 403
    assert by_kid.status_code == 403


async def _unit_with_dba(client: AsyncClient, who: Teacher, dba: dict[str, Any], title: str = "Los animales") -> str:
    unit_id: str = (await unit(client, who, title))["id"]
    response = await client.patch(f"/units/{unit_id}", json={"dba": dba}, headers=auth(who.token))
    assert response.status_code == 200, response.text
    return unit_id


async def _complete_lesson_in(client: AsyncClient, who: Teacher, unit_id: str) -> str:
    created = await lesson(client, who, unit_id)
    await client.patch(f"/lessons/{created['id']}", json={"blocks": COMPLETE_PAGES}, headers=auth(who.token))
    await client.put(f"/lessons/{created['id']}/activity", json=COMPLETE_ACTIVITY, headers=auth(who.token))
    lesson_id: str = created["id"]
    return lesson_id


async def test_la_unidad_lleva_el_dba_con_sus_evidencias_y_puntos_propios(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    _natural_sciences_first_grade(classroom_client, who)
    unit_id = await _unit_with_dba(client, who, {"dba_id": LIVING_THINGS})
    lesson_id = await _complete_lesson_in(client, who, unit_id)
    url = f"/lessons/{lesson_id}"

    refused = await client.post(f"{url}/publish", headers=auth(who.token))
    chosen = await client.patch(
        f"/units/{unit_id}",
        json={
            "dba": {
                "dba_id": LIVING_THINGS,
                # Picked out of order: they come back in the catalog's order.
                "evidence_ids": [f"{LIVING_THINGS}-3", f"{LIVING_THINGS}-1"],
                "own_points": ["  Reconoce animales terrestres de su región.  "],
            }
        },
        headers=auth(who.token),
    )
    published = await client.post(f"{url}/publish", headers=auth(who.token))
    listed = (await client.get(f"/classrooms/{who.classroom_id}/units", headers=auth(who.token))).json()

    assert refused.json()["error"]["details"]["missing"] == [NO_POINTS.format("Los animales")]
    assert chosen.status_code == 200, chosen.text
    unit_dba = listed[0]["dba"]
    assert (unit_dba["own"], unit_dba["id"], unit_dba["name"]) == (False, LIVING_THINGS, "Seres vivos y objetos sin vida")
    assert [(p["evidence_id"], p["text"]) for p in unit_dba["points"]] == [
        (
            f"{LIVING_THINGS}-1",
            "Agrupa plantas y animales de su entorno por lo que se ve de ellos y los separa de lo que no tiene vida.",
        ),
        (f"{LIVING_THINGS}-3", "Nombra las partes de una planta y de los animales que conoce."),
        (None, "Reconoce animales terrestres de su región."),
    ]
    assert published.status_code == 200, published.text
    # The lesson no longer has points of its own.
    assert "dba_points" not in published.json()
    # The family gets the unit's DBA with its points, in the progress.
    kid, _ = student(identity_client, classroom_client, who.classroom_id)
    progress = await client.get(
        f"/internal/classrooms/{who.classroom_id}/students/{kid}/progress",
        headers={"X-Internal-Key": "test-internal-key"},
    )
    [family_view] = progress.json()
    assert family_view["unit_dba"]["name"] == "Seres vivos y objetos sin vida"
    assert len(family_view["unit_dba"]["points"]) == 3


async def test_sin_dba_en_la_unidad_o_de_otro_grado_no_se_publica(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    _natural_sciences_first_grade(classroom_client, who)
    plain_unit = (await unit(client, who, "Los animales"))["id"]
    other_grade = await _unit_with_dba(
        client, who, {"dba_id": "natural_sciences-2-1", "own_points": ["Un punto."]}, "Las fuerzas"
    )
    without_dba = await _complete_lesson_in(client, who, plain_unit)
    wrong_grade = await _complete_lesson_in(client, who, other_grade)

    first = (await client.get(f"/lessons/{without_dba}", headers=auth(who.token))).json()
    second = (await client.get(f"/lessons/{wrong_grade}", headers=auth(who.token))).json()

    assert first["missing"] == [NO_DBA.format("Los animales")]
    assert second["missing"] == [WRONG_DBA.format("Las fuerzas")]


async def test_la_unidad_puede_tener_un_dba_propio_solo_con_puntos_propios(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    _natural_sciences_first_grade(classroom_client, who)
    unit_id = await _unit_with_dba(client, who, {"own_name": "  Cuido los animales de mi casa.  "})
    lesson_id = await _complete_lesson_in(client, who, unit_id)

    with_evidence = await client.patch(
        f"/units/{unit_id}",
        json={"dba": {"own_name": "Cuido los animales de mi casa.", "evidence_ids": [f"{LIVING_THINGS}-1"]}},
        headers=auth(who.token),
    )
    own = await client.patch(
        f"/units/{unit_id}",
        json={"dba": {"own_name": "Cuido los animales de mi casa.", "own_points": ["Sabe qué come su mascota."]}},
        headers=auth(who.token),
    )
    published = await client.post(f"/lessons/{lesson_id}/publish", headers=auth(who.token))

    # An own DBA has no catalog evidences to tick.
    assert with_evidence.status_code == 422
    unit_dba = own.json()["dba"]
    assert (unit_dba["own"], unit_dba["id"], unit_dba["name"]) == (True, None, "Cuido los animales de mi casa.")
    assert unit_dba["points"] == [{"evidence_id": None, "text": "Sabe qué come su mascota."}]
    assert published.status_code == 200, published.text


async def test_cambiar_el_dba_de_la_unidad_cambia_sus_puntos(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    _natural_sciences_first_grade(classroom_client, who)
    unit_id = await _unit_with_dba(
        client, who, {"dba_id": LIVING_THINGS, "evidence_ids": [f"{LIVING_THINGS}-1"], "own_points": ["Mío."]}
    )

    # The points are sent whole with the DBA: the old evidences don't stay.
    changed = await client.patch(
        f"/units/{unit_id}",
        json={"dba": {"dba_id": "natural_sciences-1-4", "own_points": ["Mío."]}},
        headers=auth(who.token),
    )
    renamed = await client.patch(f"/units/{unit_id}", json={"title": "Mi cuerpo"}, headers=auth(who.token))

    assert changed.json()["dba"]["points"] == [{"evidence_id": None, "text": "Mío."}]
    # Changing something else of the unit keeps its DBA and points.
    assert renamed.json()["dba"]["points"] == [{"evidence_id": None, "text": "Mío."}]


@pytest.mark.parametrize(
    "body",
    [
        {"dba": {"dba_id": "natural_sciences-9-9"}},
        {"dba": {"own_name": "   "}},
        {"dba": {"own_name": "x" * 201}},
        {"dba": {"own_name": "Mi DBA", "dba_id": LIVING_THINGS}},
        {"dba": {}},
        {"dba": None},
        # An evidence of another DBA, or the same one twice.
        {"dba": {"dba_id": LIVING_THINGS, "evidence_ids": ["natural_sciences-1-1-1"]}},
        {"dba": {"dba_id": LIVING_THINGS, "evidence_ids": [f"{LIVING_THINGS}-1", f"{LIVING_THINGS}-1"]}},
        {"dba": {"dba_id": LIVING_THINGS, "own_points": ["   "]}},
        {"dba": {"dba_id": LIVING_THINGS, "own_points": ["x" * 301]}},
        {"dba": {"dba_id": LIVING_THINGS, "own_points": ["uno", "dos", "tres", "cuatro", "cinco", "seis"]}},
    ],
)
async def test_el_dba_de_la_unidad_y_sus_puntos_se_validan(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient, body: dict[str, Any]
) -> None:
    who = teacher(identity_client, classroom_client)
    unit_id = (await unit(client, who))["id"]

    response = await client.patch(f"/units/{unit_id}", json=body, headers=auth(who.token))

    assert response.status_code == 422


async def test_la_leccion_ya_no_recibe_puntos_del_dba(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    unit_id = await _unit_with_dba(client, who, {"dba_id": LIVING_THINGS})
    created = await lesson(client, who, unit_id)

    response = await client.patch(
        f"/lessons/{created['id']}", json={"dba_points": {"own_points": ["Uno."]}}, headers=auth(who.token)
    )

    assert response.status_code == 422


async def test_en_un_area_sin_dba_no_se_pide(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    classroom_client.areas[who.classroom_id] = "arts"
    created = await _complete_lesson(client, who)

    published = await client.post(f"/lessons/{created['id']}/publish", headers=auth(who.token))

    assert published.status_code == 200, published.text


async def test_sin_saber_la_clase_no_se_publica_pero_el_editor_si_abre(
    client: AsyncClient, identity_client: FakeIdentityClient, classroom_client: FakeClassroomClient
) -> None:
    who = teacher(identity_client, classroom_client)
    _natural_sciences_first_grade(classroom_client, who)
    created = await _complete_lesson(client, who)
    classroom_client.areas_available = False

    detail = await client.get(f"/lessons/{created['id']}", headers=auth(who.token))
    refused = await client.post(f"/lessons/{created['id']}/publish", headers=auth(who.token))

    assert detail.status_code == 200
    assert refused.status_code == 503
    assert refused.json()["error"]["code"] == "clase_no_disponible"
