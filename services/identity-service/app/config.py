from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The HMAC key has to be at least as long as the hash it signs with (RFC 7518,
# section 3.2). A shorter one can be brute forced much faster.
JWT_SECRET_MIN_BYTES = {"HS256": 32, "HS384": 48, "HS512": 64}


class Settings(BaseSettings):
    # hide_input_in_errors: if a setting is wrong, the error says which one
    # but never prints its value, so a secret doesn't end up in the logs.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

    service_name: str = "identity-service"
    environment: str = "development"

    database_url: str = "sqlite+aiosqlite:///./dev.db"

    redis_url: str = "redis://localhost:6379/0"

    # No default value here on purpose. If we put a fake secret in the code
    # and someone forgets to set the real one, that fake secret would still
    # work to sign tokens, and anyone who reads the code could forge one.
    # It is safer to make the app fail to start than to run with a weak key.
    # Same with a short one: see _check_jwt_secret_length below.
    jwt_secret: str
    # Only HMAC: the service signs and checks with this one shared secret.
    jwt_algorithm: Literal["HS256", "HS384", "HS512"] = "HS256"
    jwt_access_ttl_min: int = 15
    jwt_refresh_ttl_days: int = 7
    # The refresh token goes in this cookie, never in the JSON. Path is the one
    # the browser sees (through the gateway), so it only travels to /auth.
    # Secure stays on everywhere, browsers accept it on http://localhost too.
    refresh_cookie_name: str = "iris_refresh"
    refresh_cookie_path: str = "/api/identity/auth"
    refresh_cookie_secure: bool = True

    # Every other service needs this same key to call our internal routes.
    # No default for the same reason as jwt_secret above.
    internal_service_key: str

    web_origin: str = "http://localhost:5173"

    # Garage, where the avatar images live. The key only has read access to
    # this bucket. No default for the key pair, same reason as jwt_secret.
    s3_endpoint_url: str = "http://garage:3900"
    s3_access_key: str
    s3_secret_key: str
    s3_bucket: str = "iris-identity"
    s3_region: str = "us-east-1"

    # Progressive lock for login and the parents' portal 2FA. After
    # lockout_max_failures wrong attempts inside lockout_fails_window_sec the
    # key is locked. The wait follows lockout_wait_steps_sec, and the last
    # step repeats. A success, or lockout_reset_after_sec without new locks,
    # starts over.
    lockout_max_failures: int = 5
    lockout_fails_window_sec: int = 300
    lockout_wait_steps_sec: list[int] = [60, 300, 900]
    lockout_reset_after_sec: int = 3600
    # Cap over a whole account, whatever the session or IP, so many sessions
    # or many IPs can't add up to unlimited guesses.
    account_lockout_max_failures: int = 20
    account_lockout_fails_window_sec: int = 3600
    account_lockout_wait_sec: int = 900
    # Student PIN: kids type it with their eyes, so the waits are shorter.
    pin_lockout_max_failures: int = 6
    pin_lockout_fails_window_sec: int = 600
    pin_lockout_wait_steps_sec: list[int] = [30, 120, 300]
    # A used refresh token shown again after this many seconds is treated as
    # theft. Before that it is just two requests racing each other.
    refresh_reuse_grace_sec: int = 10
    rate_limit_totp_max: int = 5
    rate_limit_totp_window_sec: int = 300
    # A passed 2FA check keeps the parents' portal open in that session while
    # the guardian keeps using it: it closes after this long without activity,
    # and after the max age no matter what.
    portal_access_ttl_sec: int = 900
    portal_access_max_age_sec: int = 7200

    # Must be a valid Fernet key (32 url-safe base64-encoded bytes). You can
    # generate one with:
    # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Used only to encrypt people.totp_secret, never for anything else,
    # and never the same key as jwt_secret. No default, same reason as above.
    totp_encryption_key: str
    totp_issuer_name: str = "IRIS"

    # Counted in bytes, not characters, because that's what HMAC gets.
    @model_validator(mode="after")
    def _check_jwt_secret_length(self) -> "Settings":
        minimum = JWT_SECRET_MIN_BYTES[self.jwt_algorithm]
        if len(self.jwt_secret.encode()) < minimum:
            raise ValueError(
                f"JWT_SECRET is too short for {self.jwt_algorithm}: it needs at least {minimum} bytes. "
                "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # pydantic-settings fills required fields from the environment; mypy can't see that
