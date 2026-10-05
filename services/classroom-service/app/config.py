from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "classroom-service"
    environment: str = "development"

    database_url: str = "sqlite+aiosqlite:///./dev.db"

    redis_url: str = "redis://localhost:6379/0"

    # This service never decodes JWTs, only identity-service has JWT_SECRET.
    # No default on purpose: a value in the code would be a real secret in the
    # git history, so it has to fail at startup when it's missing.
    internal_service_key: str

    web_origin: str = "http://localhost:5173"

    identity_service_url: str = "http://localhost:8001"

    # Only for its internal route that deletes a classroom's lessons.
    content_service_url: str = "http://localhost:8003"

    # Garage, where the logos live. The key only works on this bucket. No
    # default for the key pair, same reasoning as internal_service_key above.
    s3_endpoint_url: str = "http://garage:3900"
    s3_access_key: str
    s3_secret_key: str
    s3_bucket: str = "iris-classroom"
    s3_region: str = "us-east-1"

    rate_limit_enrollment_max: int = 5
    rate_limit_enrollment_window_sec: int = 600


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # pydantic-settings fills required fields from the environment; mypy can't see that
