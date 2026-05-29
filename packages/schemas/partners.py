from __future__ import annotations

from pydantic import BaseModel, Field


class TranscriptionRequest(BaseModel):
    audio_url: str | None = None
    audio_file_id: str | None = None
    language: str = "en"
    mock_text: str | None = None


class TranscriptionResult(BaseModel):
    transcript_id: str
    provider: str = "speechmatics"
    text: str
    language: str = "en"
    confidence: float = 0.9
    speaker_labels: list[str] = Field(default_factory=list)


class MemoryUpsertRequest(BaseModel):
    workspace_id: str
    entity: str
    content: str
    evidence_urls: list[str] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)


class MemoryRecord(BaseModel):
    memory_id: str
    provider: str = "webdataos_memory"
    workspace_id: str
    entity: str
    content: str
    evidence_urls: list[str] = Field(default_factory=list)
    score: float = 1.0


class MemorySearchRequest(BaseModel):
    workspace_id: str
    query: str
    entities: list[str] = Field(default_factory=list)
    top_k: int = Field(default=5, ge=1, le=25)


class WorkflowTriggerRequest(BaseModel):
    workspace_id: str
    event_type: str
    summary: str
    severity: str = "medium"
    payload: dict = Field(default_factory=dict)


class WorkflowEvent(BaseModel):
    event_id: str
    provider: str = "triggerware"
    workspace_id: str
    event_type: str
    status: str
    action: str
    severity: str
    summary: str
