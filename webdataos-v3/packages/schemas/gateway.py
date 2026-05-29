from typing import Any
from pydantic import BaseModel, Field
from packages.schemas.common import FailureType, ToolName


class GatewayFetchRequest(BaseModel):
    url: str | None = None
    query: str | None = None
    task_type: str = "general_extraction"
    preferred_tool: ToolName | None = None
    output_schema: dict[str, Any] = Field(default_factory=dict)
    country: str | None = None
    max_attempts: int | None = Field(default=None, ge=1, le=8)
    metadata: dict[str, Any] = Field(default_factory=dict)


class RecoveryStep(BaseModel):
    attempt: int
    tool: ToolName
    status: str
    failure_type: FailureType = FailureType.none
    reason: str | None = None
    latency_ms: int | None = None


class GatewayFetchResponse(BaseModel):
    status: str
    request_id: str
    receipt_id: str | None = None
    source_url: str | None = None
    query: str | None = None
    tool_used: ToolName
    recovery_path: list[RecoveryStep] = Field(default_factory=list)
    data: dict[str, Any] = Field(default_factory=dict)
    raw_text: str | None = None
    confidence: float = Field(default=0.0, ge=0, le=1)
    extracted_at: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
