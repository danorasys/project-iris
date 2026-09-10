from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "identity-service"
    environment: str = "development"

    database_url: str = "sqlite+aiosqlite:///./dev.db"

    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_access_ttl_min: int = 15
    jwt_refresh_ttl_days: int = 7

    internal_service_key: str = "dev-internal-key"

    web_origin: str = "http://localhost:5173"

    rate_limit_login_max: int = 5
    rate_limit_login_window_sec: int = 900
    rate_limit_pin_max: int = 8
    rate_limit_pin_window_sec: int = 600


@lru_cache
def get_settings() -> Settings:
    return Settings()
