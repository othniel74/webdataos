from functools import lru_cache
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "web-data-unlocked"
    app_env: str = "development"
    log_level: str = "INFO"
    mock_brightdata: bool = True

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/webdata"
    sync_database_url: str = "postgresql://postgres:postgres@localhost:5432/webdata"

    neo4j_enabled: bool = False
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "password12345"

    brightdata_api_key: str | None = None
    brightdata_api_endpoint: str = "https://api.brightdata.com/request"
    brightdata_scraper_endpoint: str = "https://api.brightdata.com/datasets/v3/trigger"
    brightdata_serp_zone: str = "serp_api1"
    brightdata_web_unlocker_zone: str = "web_unlocker2"
    brightdata_scraping_browser_zone: str = "scraping_browser2"
    brightdata_scraping_browser_endpoint: str = "wss://brd.superproxy.io:9222"
    brightdata_selenium_endpoint: str | None = None
    brightdata_browser_user: str | None = None
    brightdata_browser_password: str | None = None
    brightdata_mcp_endpoint: str | None = None
    # Legacy — kept for backward compat, not used if above are set
    brightdata_serp_endpoint: str | None = None
    brightdata_web_scraper_endpoint: str | None = None
    brightdata_web_unlocker_endpoint: str | None = None

    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    anthropic_api_key: str | None = None
    aimlapi_api_key: str | None = None
    aimlapi_base_url: str = "https://api.aimlapi.com/v1"
    aimlapi_models_url: str = "https://api.aimlapi.com/models"
    aimlapi_model: str = "gpt-4o"

    speechmatics_api_key: str | None = None
    speechmatics_endpoint: str | None = "https://asr.api.speechmatics.com/v2/jobs"
    speechmatics_poll_attempts: int = Field(default=60, ge=1, le=240)
    speechmatics_poll_interval_seconds: float = Field(default=5.0, ge=0.5, le=30.0)
    cognee_api_key: str | None = None
    cognee_endpoint: str | None = None
    triggerware_api_key: str | None = None
    triggerware_endpoint: str | None = None

    refresh_interval_minutes: int = 1440
    default_country: str = "us"
    request_timeout_seconds: int = Field(default=30, ge=1, le=300)
    max_recovery_attempts: int = Field(default=4, ge=1, le=8)
    retry_attempts: int = Field(default=3, ge=1, le=8)
    retry_backoff_min_seconds: float = Field(default=0.25, ge=0.0)
    retry_backoff_max_seconds: float = Field(default=3.0, ge=0.1)

    # API security. In development, auth can be disabled. In production, set API_AUTH_ENABLED=true
    # and provide one or more comma-separated keys in API_KEYS.
    api_auth_enabled: bool = False
    api_keys: str = ""
    api_key_header_name: str = "X-API-Key"
    cors_allowed_origins: str = "http://localhost:5173,http://localhost:3000"
    trusted_hosts: str = "localhost,127.0.0.1,api,web"

    # In-memory edge controls for the demo deployment. Replace with Redis for multi-instance production.
    rate_limit_enabled: bool = True
    rate_limit_requests_per_minute: int = Field(default=120, ge=1)
    request_body_max_bytes: int = Field(default=2_000_000, ge=10_000)

    circuit_breaker_enabled: bool = True
    circuit_breaker_failure_threshold: int = Field(default=5, ge=1)
    circuit_breaker_reset_seconds: int = Field(default=60, ge=1)

    otel_enabled: bool = False
    otel_exporter_otlp_endpoint: str | None = None
    prometheus_enabled: bool = True

    @field_validator("api_keys")
    @classmethod
    def strip_keys(cls, v: str) -> str:
        return ",".join([key.strip() for key in v.split(",") if key.strip()])

    @property
    def api_key_set(self) -> set[str]:
        return {key.strip() for key in self.api_keys.split(",") if key.strip()}

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()]

    @property
    def trusted_hosts_list(self) -> list[str]:
        return [host.strip() for host in self.trusted_hosts.split(",") if host.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() in {"production", "prod"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
