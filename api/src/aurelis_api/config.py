"""Runtime configuration, read from environment variables (never hard-coded secrets)."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AURELIS_", env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres@127.0.0.1:5433/aurelis"

    # SEC fair-access policy: identify yourself and stay under 10 requests/second.
    # Format recommended by the SEC: "Company or name contact@example.com".
    sec_user_agent: str | None = None
    sec_max_requests_per_second: float = Field(default=8.0, gt=0, le=10)
    sec_timeout_seconds: float = 30.0
    sec_max_retries: int = 4

    # Temporary shared secret for admin endpoints; Phase 6 replaces it with real auth.
    admin_token: str | None = None

    # Freshness: how long since the last successful SEC check before data counts as unchecked.
    sync_max_age_hours: int = 24


@lru_cache
def get_settings() -> Settings:
    return Settings()
