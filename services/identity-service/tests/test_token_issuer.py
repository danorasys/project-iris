from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.domain.exceptions import InvalidToken
from app.infrastructure.security import JwtTokenIssuer

SECRET = "test-secret-with-enough-length-for-hs256"


@pytest.fixture
def issuer() -> JwtTokenIssuer:
    return JwtTokenIssuer(SECRET, "HS256", access_ttl_min=15, refresh_ttl_days=7)


def _sign(payload: dict, key: str = SECRET, algorithm: str = "HS256") -> str:
    return jwt.encode(payload, key, algorithm=algorithm)


def test_un_token_emitido_se_puede_leer(issuer: JwtTokenIssuer) -> None:
    subject = uuid.uuid4()
    token = issuer.emitir_access_token(subject, "guardian", {}, "sid-1")

    claims = issuer.decodificar(token)

    assert claims["sub"] == str(subject)
    assert claims["type"] == "access"
    assert claims["sid"] == "sid-1"


def test_un_token_firmado_con_otra_clave_se_rechaza(issuer: JwtTokenIssuer) -> None:
    now = datetime.now(timezone.utc)
    token = _sign({"sub": "x", "iat": now, "exp": now + timedelta(minutes=5)}, key="otra-clave-distinta-de-la-real")

    with pytest.raises(InvalidToken):
        issuer.decodificar(token)


def test_un_token_sin_firma_se_rechaza(issuer: JwtTokenIssuer) -> None:
    now = datetime.now(timezone.utc)
    token = jwt.encode({"sub": "x", "iat": now, "exp": now + timedelta(minutes=5)}, None, algorithm="none")

    with pytest.raises(InvalidToken):
        issuer.decodificar(token)


def test_un_token_vencido_se_rechaza(issuer: JwtTokenIssuer) -> None:
    now = datetime.now(timezone.utc)
    token = _sign({"sub": "x", "iat": now - timedelta(hours=1), "exp": now - timedelta(minutes=1)})

    with pytest.raises(InvalidToken):
        issuer.decodificar(token)


@pytest.mark.parametrize("missing", ["exp", "iat", "sub"])
def test_un_token_sin_los_datos_obligatorios_se_rechaza(issuer: JwtTokenIssuer, missing: str) -> None:
    now = datetime.now(timezone.utc)
    payload = {"sub": "x", "iat": now, "exp": now + timedelta(minutes=5)}
    del payload[missing]

    with pytest.raises(InvalidToken):
        issuer.decodificar(_sign(payload))
