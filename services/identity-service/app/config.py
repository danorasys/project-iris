from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "identity-service"
    environment: str = "development"

    database_url: str = "sqlite+aiosqlite:///./dev.db"

    redis_url: str = "redis://localhost:6379/0"

    # No default value here on purpose. If we put a fake secret in the code
    # and someone forgets to set the real one, that fake secret would still
    # work to sign tokens, and anyone who reads the code could forge one.
    # It is safer to make the app fail to start than to run with a weak key.
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_access_ttl_min: int = 15
    jwt_refresh_ttl_days: int = 7

    # Every other service needs this same key to call our internal routes.
    # No default for the same reason as jwt_secret above.
    internal_service_key: str

    web_origin: str = "http://localhost:5173"

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
    # How long a passed 2FA check keeps the parents' portal open.
    portal_access_ttl_sec: int = 900

    # Must be a valid Fernet key (32 url-safe base64-encoded bytes). You can
    # generate one with:
    # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Used only to encrypt guardians.totp_secret, never for anything else,
    # and never the same key as jwt_secret. No default, same reason as above.
    totp_encryption_key: str
    totp_issuer_name: str = "IRIS"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # pydantic-settings fills required fields from the environment; mypy can't see that
