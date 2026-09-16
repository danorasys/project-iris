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

    rate_limit_login_max: int = 5
    rate_limit_login_window_sec: int = 900
    rate_limit_pin_max: int = 8
    rate_limit_pin_window_sec: int = 600
    rate_limit_totp_max: int = 5
    rate_limit_totp_window_sec: int = 300
    # Limits how many times someone can try re-entering the guardian's
    # password before opening the parents' portal (see confirm_password in
    # GuardianService). This limit is tied to the account, not the IP
    # address, since a family computer could share the same IP.
    rate_limit_confirm_password_max: int = 5
    rate_limit_confirm_password_window_sec: int = 300

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
