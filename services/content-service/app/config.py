from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "content-service"
    environment: str = "development"

    database_url: str = "sqlite+aiosqlite:///./dev.db"

    redis_url: str = "redis://localhost:6379/0"

    # content-service never sees JWT_SECRET, only identity-service has it.
    # Tokens are validated by calling identity-service, never decoded locally.
    #
    # No default: a working value checked into source is a real, usable
    # secret sitting in git history forever. Startup must fail loudly if this
    # isn't set, instead of anyone with repo access being able to call this
    # service's internal-only routes.
    internal_service_key: str
    identity_service_url: str = "http://identity-service:8000"
    classroom_service_url: str = "http://classroom-service:8000"

    web_origin: str = "http://localhost:5173"

    s3_endpoint_url: str = "http://minio:9000"
    s3_public_url: str = "http://localhost:9000"
    s3_access_key: str = "iris"
    # No default, same reasoning as internal_service_key above — this is the
    # MinIO/S3 root password, s3_access_key alone (the root user) grants
    # nothing without it.
    s3_secret_key: str
    s3_bucket: str = "iris-media"
    s3_region: str = "us-east-1"

    auth_cache_ttl_seconds: int = 30
    circuit_breaker_failure_threshold: int = 5
    circuit_breaker_recovery_seconds: int = 30
    max_image_bytes: int = 5 * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # pydantic-settings fills required fields from the environment; mypy can't see that
