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
    topic_id: str
    entity_name: str | None = None
    entity_type: str | None = None
    source_url: str
    source_type: str = "unknown"
    facts: dict[str, Any] = Field(default_factory=dict)
    summary: str | None = None
    confidence: float = 0.0
    freshness_status: str = "unknown"
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
