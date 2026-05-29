from enum import Enum
from typing import Any
from pydantic import BaseModel, Field, HttpUrl


class ToolName(str, Enum):
    serp_api = "serp_api"
    web_scraper_api = "web_scraper_api"
    web_unlocker = "web_unlocker"
    scraping_browser = "scraping_browser"
    scraper_studio = "scraper_studio"
    mock = "mock"


class FailureType(str, Enum):
    none = "none"
    blocked = "blocked"
    captcha = "captcha"
    geo_blocked = "geo_blocked"
    rate_limited = "rate_limited"
    javascript_required = "javascript_required"
    selector_failed = "selector_failed"
    empty_response = "empty_response"
    timeout = "timeout"
    unknown = "unknown"


class SourceType(str, Enum):
    search_result = "search_result"
    company_page = "company_page"
    pricing_page = "pricing_page"
    docs_page = "docs_page"
    news_page = "news_page"
    filing = "filing"
    social_public = "social_public"
    unknown = "unknown"


class CleanJSON(BaseModel):
    data: dict[str, Any] = Field(default_factory=dict)
    text: str | None = None
    confidence: float = Field(default=0.0, ge=0, le=1)
    source_url: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class SourceEvidence(BaseModel):
    field: str
    source_url: str
    evidence_text: str | None = None
    confidence: float = Field(default=0.0, ge=0, le=1)
