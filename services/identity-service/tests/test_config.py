from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config import Settings

# The rest of the settings come from the environment conftest.py sets up.


def _settings(**overrides: object) -> Settings:
    return Settings(_env_file=None, **overrides)  # type: ignore[call-arg, arg-type]


def test_a_secret_of_32_bytes_is_enough_for_hs256() -> None:
    settings = _settings(jwt_secret="a" * 32)

    assert settings.jwt_algorithm == "HS256"


def test_a_short_secret_stops_the_service_without_printing_it() -> None:
    secret = "short-but-real-looking-key"

    with pytest.raises(ValidationError) as error:
        _settings(jwt_secret=secret)

    message = str(error.value)
    assert "JWT_SECRET is too short for HS256" in message
    assert "32 bytes" in message
    # The value never shows up, not even in the error.
    assert secret not in message


# Bytes, not characters: "ñ" takes two, so 16 of them are enough.
def test_the_length_is_counted_in_bytes() -> None:
    _settings(jwt_secret="ñ" * 16)

    with pytest.raises(ValidationError):
        _settings(jwt_secret="ñ" * 15)


@pytest.mark.parametrize(("algorithm", "minimum"), [("HS384", 48), ("HS512", 64)])
def test_longer_hashes_need_longer_secrets(algorithm: str, minimum: int) -> None:
    _settings(jwt_algorithm=algorithm, jwt_secret="a" * minimum)

    with pytest.raises(ValidationError, match=f"at least {minimum} bytes"):
        _settings(jwt_algorithm=algorithm, jwt_secret="a" * (minimum - 1))


# Only the HMAC ones: "none" or an RSA one would never work with a shared secret.
@pytest.mark.parametrize("algorithm", ["none", "RS256", "hs256"])
def test_other_algorithms_are_refused(algorithm: str) -> None:
    with pytest.raises(ValidationError):
        _settings(jwt_algorithm=algorithm, jwt_secret="a" * 64)
