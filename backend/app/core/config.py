"""Application settings loaded from environment / .env via pydantic-settings."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed application configuration.

    All values are optional and carry sensible defaults so the app boots with
    no environment configured at all.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # External provider keys (all optional; empty => canned/placeholder mode).
    anthropic_api_key: str | None = None
    elevenlabs_api_key: str | None = None
    replicate_api_token: str | None = None
    stability_api_key: str | None = None

    # Infrastructure.
    redis_url: str = "redis://localhost:6379"
    database_url: str = "sqlite+aiosqlite:///./storyweaver.db"

    # Security / app.
    parent_dashboard_secret: str | None = None
    cors_origins: str = "http://localhost:5173"
    log_level: str = "INFO"

    # Model name (pinned per brief).
    claude_model: str = "claude-sonnet-4-5"

    @property
    def cors_origin_list(self) -> list[str]:
        """CORS origins parsed from the comma-separated env value."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def has_anthropic(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def has_replicate(self) -> bool:
        return bool(self.replicate_api_token)

    @property
    def has_elevenlabs(self) -> bool:
        return bool(self.elevenlabs_api_key)


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()


settings = get_settings()
