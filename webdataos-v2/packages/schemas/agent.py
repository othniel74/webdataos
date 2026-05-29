from pydantic import BaseModel, Field
from packages.schemas.intelligence import IntelligenceRecordRead
from packages.schemas.partners import MemoryRecord, TranscriptionResult, WorkflowEvent


class ResearchRequest(BaseModel):
    task: str
    topic_id: str = "workspace_enterprise"
    workspace_id: str | None = None
    package_id: str = "enterprise"
    freshness_required_days: int = 7
    max_sources: int = Field(default=8, ge=1, le=25)
    input_mode: str = Field(default="text", pattern="^(text|voice|audio_upload)$")
    audio_url: str | None = None
    transcript_text: str | None = None
    enable_memory: bool = True
    enable_workflows: bool = True


class ResearchPlanStep(BaseModel):
    step: int
    action: str
    purpose: str
    tool_hint: str | None = None


class ResearchReport(BaseModel):
    run_id: str
    task: str
    workspace_id: str | None = None
    package_id: str = "enterprise"
    summary: str
    key_findings: list[str]
    companies: list[dict] = Field(default_factory=list)
    recent_changes: list[dict] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    records_used: list[IntelligenceRecordRead] = Field(default_factory=list)
    transcript: TranscriptionResult | None = None
    memories_used: list[MemoryRecord] = Field(default_factory=list)
    workflow_events: list[WorkflowEvent] = Field(default_factory=list)
    partner_trace: list[str] = Field(default_factory=list)
    confidence: float = 0.0
    plan: list[ResearchPlanStep] = Field(default_factory=list)
    # ── v2: Reasoning & autonomous analyst fields ──
    reasoning: dict | None = Field(default=None, description="ReasoningOutput from the LLM-backed reasoning engine")
    autonomous_actions: list[dict] = Field(default_factory=list, description="Proposed actions with approval status")
    org_context_used: bool = Field(default=False, description="Whether organizational context was applied")
