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
    #
    # No default: a working value checked into source is a real, usable
    # secret sitting in git history forever. Startup must fail loudly if this
    # isn't set, instead of anyone with repo access being able to call this
    # service's internal-only routes.
    internal_service_key: str

    web_origin: str = "http://localhost:5173"

    identity_service_url: str = "http://localhost:8001"

    s3_endpoint_url: str = "http://localhost:9000"
    s3_public_url: str = "http://localhost:9000"
    s3_access_key: str = "iris"
    # No default, same reasoning as internal_service_key above — this is the
    # MinIO/S3 root password, s3_access_key alone (the root user) grants
    # nothing without it.
    s3_secret_key: str
    s3_bucket: str = "iris-media"
    s3_region: str = "us-east-1"

    rate_limit_enrollment_max: int = 5
    rate_limit_enrollment_window_sec: int = 600


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # pydantic-settings fills required fields from the environment; mypy can't see that
