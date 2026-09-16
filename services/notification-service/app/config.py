from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "notification-service"
    environment: str = "development"

    database_url: str = "sqlite+aiosqlite:///./dev.db"

    redis_url: str = "redis://localhost:6379/0"

    identity_service_url: str = "http://localhost:8001"
    # No default: a working value checked into source is a real, usable
    # secret sitting in git history forever. Startup must fail loudly if this
    # isn't set, instead of anyone with repo access being able to call this
    # service's internal-only routes.
    internal_service_key: str

    web_origin: str = "http://localhost:5173"

    # Timeout for the call to identity-service that validates the access
    # token on every request to this service's own REST routes.
    identity_http_timeout_sec: float = 2.0

    # Circuit breaker for the call to identity-service.
    circuit_breaker_failure_threshold: int = 5
    circuit_breaker_recovery_seconds: float = 30.0

    # How long a validated token is cached before checking identity-service
    # again. The notification tray polls every ~20s, this avoids revalidating
    # the same token on every poll.
    auth_cache_ttl_seconds: int = 30

    redis_requests_channel: str = "classroom.requests"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # pydantic-settings fills required fields from the environment; mypy can't see that
