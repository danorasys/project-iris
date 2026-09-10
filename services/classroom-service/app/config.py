from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "classroom-service"
    environment: str = "development"

    database_url: str = "sqlite+aiosqlite:///./dev.db"

    redis_url: str = "redis://localhost:6379/0"

    # classroom-service never decodes JWT locally. Only identity-service knows
    # JWT_SECRET, and docker-compose only passes it there.
    internal_service_key: str = "dev-internal-key"

    web_origin: str = "http://localhost:5173"

    identity_service_url: str = "http://localhost:8001"

    s3_endpoint_url: str = "http://localhost:9000"
    s3_public_url: str = "http://localhost:9000"
    s3_access_key: str = "iris"
    s3_secret_key: str = "change-me-dev-only"
    s3_bucket: str = "iris-media"
    s3_region: str = "us-east-1"

    rate_limit_enrollment_max: int = 5
    rate_limit_enrollment_window_sec: int = 600


@lru_cache
def get_settings() -> Settings:
    return Settings()
