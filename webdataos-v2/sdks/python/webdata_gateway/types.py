from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

ToolName = Literal[
    "serp_api",
    "web_scraper_api",
    "web_unlocker",
    "scraping_browser",
    "scraper_studio",
    "mcp_server",
    "proxies",
]


@dataclass(slots=True)
class GatewayFetchRequest:
    url: str | None = None
    query: str | None = None
    task_type: str = "general_extraction"
    preferred_tool: ToolName | None = None
    output_schema: dict[str, Any] = field(default_factory=dict)
    country: str | None = None
    max_attempts: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "url": self.url,
            "query": self.query,
            "task_type": self.task_type,
            "preferred_tool": self.preferred_tool,
            "output_schema": self.output_schema,
            "country": self.country,
            "max_attempts": self.max_attempts,
            "metadata": self.metadata,
        }


@dataclass(slots=True)
class GatewayFetchResponse:
    status: str
    request_id: str
    tool_used: str
    extracted_at: str
    source_url: str | None = None
    query: str | None = None
    recovery_path: list[dict[str, Any]] = field(default_factory=list)
    data: dict[str, Any] = field(default_factory=dict)
    raw_text: str | None = None
    confidence: float = 0.0
    error: str | None = None

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "GatewayFetchResponse":
        return cls(**payload)


@dataclass(slots=True)
class TopicCreate:
    id: str
    name: str
    description: str | None = None
    entities: list[str] = field(default_factory=list)
    watch_types: list[str] = field(default_factory=list)
    refresh_frequency_minutes: int = 1440

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "entities": self.entities,
            "watch_types": self.watch_types,
            "refresh_frequency_minutes": self.refresh_frequency_minutes,
        }


@dataclass(slots=True)
class TopicResponse:
    id: str
    name: str
    description: str | None = None
    entities: list[str] = field(default_factory=list)
    watch_types: list[str] = field(default_factory=list)
    refresh_frequency_minutes: int = 1440
    created_at: str | None = None

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "TopicResponse":
        return cls(**payload)


@dataclass(slots=True)
class RetrievalRequest:
    query: str
    topic_id: str | None = None
    entities: list[str] = field(default_factory=list)
    freshness_required_days: int | None = None
    source_types: list[str] = field(default_factory=list)
    top_k: int = 8

    def to_dict(self) -> dict[str, Any]:
        return {
            "query": self.query,
            "topic_id": self.topic_id,
            "entities": self.entities,
            "freshness_required_days": self.freshness_required_days,
            "source_types": self.source_types,
            "top_k": self.top_k,
        }


@dataclass(slots=True)
class RetrievalResponse:
    results: list[dict[str, Any]]

    @classmethod
    def from_dict(cls, payload: Any) -> "RetrievalResponse":
        if isinstance(payload, list):
            return cls(results=payload)
        return cls(results=payload.get("results", []))


@dataclass(slots=True)
class ResearchRequest:
    task: str
    topic_id: str | None = None
    freshness_required: str = "7_days"
    max_sources: int = 8

    def to_dict(self) -> dict[str, Any]:
        return {
            "task": self.task,
            "topic_id": self.topic_id,
            "freshness_required": self.freshness_required,
            "max_sources": self.max_sources,
        }


@dataclass(slots=True)
class ResearchResponse:
    summary: str
    report: dict[str, Any] = field(default_factory=dict)
    sources: list[dict[str, Any]] = field(default_factory=list)
    records_used: int = 0
    sources_refreshed: int = 0
    confidence: float = 0.0

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "ResearchResponse":
        return cls(**payload)
