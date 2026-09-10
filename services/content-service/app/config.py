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
    internal_service_key: str = "dev-internal-key"
    identity_service_url: str = "http://identity-service:8000"
    classroom_service_url: str = "http://classroom-service:8000"

    web_origin: str = "http://localhost:5173"

    s3_endpoint_url: str = "http://minio:9000"
    s3_public_url: str = "http://localhost:9000"
    s3_access_key: str = "iris"
    s3_secret_key: str = "change-me-dev-only"
    s3_bucket: str = "iris-media"
    s3_region: str = "us-east-1"

    auth_cache_ttl_seconds: int = 30
    circuit_breaker_failure_threshold: int = 5
    circuit_breaker_recovery_seconds: int = 30
    max_image_bytes: int = 5 * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
