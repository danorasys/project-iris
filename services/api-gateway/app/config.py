from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "api-gateway"
    environment: str = "development"

    identity_service_url: str = "http://localhost:8001"
    classroom_service_url: str = "http://localhost:8002"
    content_service_url: str = "http://localhost:8003"
    notification_service_url: str = "http://localhost:8004"

    web_origin: str = "http://localhost:5173"

    # Timeout for the actual user request forwarded to a domain service.
    # Longer than the 2s used for internal checks (validating a token,
    # checking ownership) because this is the real request, not a side check.
    proxy_timeout_sec: float = 10.0

    # Short timeout for the /health/ready checks against each service.
    health_check_timeout_sec: float = 2.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
