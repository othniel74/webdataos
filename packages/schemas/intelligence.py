from typing import Any
from pydantic import BaseModel, Field


class TopicCreate(BaseModel):
    id: str
    name: str
    description: str | None = None
    entities: list[str] = Field(default_factory=list)
    watch_types: list[str] = Field(default_factory=list)
    refresh_frequency_minutes: int = 1440


class TopicRead(TopicCreate):
    created_at: str | None = None


class SourceRecord(BaseModel):
    url: str
    title: str | None = None
    snippet: str | None = None
    source_type: str = "unknown"
    authority: str = "unknown"


class IntelligenceRecordRead(BaseModel):
    id: str
    tenant_id: str | None = None
    topic_id: str
    entity_name: str | None = None
    entity_type: str | None = None
    source_url: str
    source_type: str = "unknown"
    facts: dict[str, Any] = Field(default_factory=dict)
    summary: str | None = None
    confidence: float = 0.0
    freshness_status: str = "unknown"
    source_tier: int = 3
    last_checked: str | None = None
    extracted_at: str | None = None


class RetrievalRequest(BaseModel):
    query: str
    topic_id: str | None = None
    entities: list[str] = Field(default_factory=list)
    freshness_required_days: int | None = None
    source_types: list[str] = Field(default_factory=list)
    top_k: int = Field(default=8, ge=1, le=50)


class RetrievalResult(BaseModel):
    record: IntelligenceRecordRead
    score: float
    reasons: list[str] = Field(default_factory=list)


class GraphNode(BaseModel):
    id: str
    label: str
    type: str
    properties: dict[str, Any] = Field(default_factory=dict)


class GraphRelationship(BaseModel):
    source: str
    target: str
    type: str
    properties: dict[str, Any] = Field(default_factory=dict)


class GraphSnapshot(BaseModel):
    status: str = "disabled"
    nodes: list[GraphNode] = Field(default_factory=list)
    relationships: list[GraphRelationship] = Field(default_factory=list)
    counts: dict[str, int] = Field(default_factory=dict)
    message: str | None = None


class GraphStatus(BaseModel):
    status: str
    enabled: bool = False
    counts: dict[str, int] = Field(default_factory=dict)
    top_entities: list[dict[str, Any]] = Field(default_factory=list)
    signal_summary: list[dict[str, Any]] = Field(default_factory=list)
    message: str | None = None


class GraphBackfillResult(BaseModel):
    status: str
    topic_id: str
    records_seen: int = 0
    records_mirrored: int = 0
    records_skipped_stale: int = 0
    records_failed: int = 0
    message: str | None = None
