# Small helpers shared by the tests.

from __future__ import annotations

from httpx import AsyncClient, Response

from tests.fakes import FakeIdentityGateway


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# Asks to join a class for the kid behind student_token, the way it's done
# now: their guardian types the code in the parents' portal (ADR 0016).
async def pedir_ingreso(client: AsyncClient, enrollment_code: str, student_token: str) -> Response:
    identity = FakeIdentityGateway.current
    assert identity is not None, "the test needs the identity_gateway fixture"
    student_id = identity.sub_de(student_token)
    return await client.post(
        "/classrooms/family/requests",
        json={"student_id": str(student_id), "enrollment_code": enrollment_code},
        headers=auth(identity.tutor_de(student_token)),
    )
