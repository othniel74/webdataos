from pydantic import BaseModel, Field
from packages.schemas.intelligence import IntelligenceRecordRead
from packages.schemas.partners import MemoryRecord, TranscriptionResult, WorkflowEvent


class ResearchRequest(BaseModel):
    task: str
    conversation_context: str | None = None
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
    enable_llm: bool = True
    allow_live_refresh: bool = True


class ResearchPlanStep(BaseModel):
    step: int
    action: str
    purpose: str
    tool_hint: str | None = None


class ResearchRunStage(BaseModel):
    name: str
    status: str
    provider: str | None = None
    detail: str | None = None


class ResearchRunReceipt(BaseModel):
    run_id: str
    topic_id: str | None = None
    tenant_id: str | None = None
    package_id: str | None = None
    task: str | None = None
    status: str
    input_mode: str
    stages: list[ResearchRunStage] = Field(default_factory=list)
    value_loop: list[dict] = Field(default_factory=list)
    providers: dict[str, str | None] = Field(default_factory=dict)
    counts: dict[str, int] = Field(default_factory=dict)
    fallbacks_used: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class DecisionEvidence(BaseModel):
    id: str
    entity_name: str | None = None
    source_url: str
    source_title: str | None = None
    summary: str | None = None
    confidence: float = 0.0
    freshness_status: str | None = None
    why_it_matters: str | None = None


class DecisionBrief(BaseModel):
    headline: str
    delta_headline: str | None = None
    answer: str
    what_changed: str
    business_impact: str
    severity: str = "monitoring"
    confidence: float = 0.0
    recommended_action: str
    evidence: list[DecisionEvidence] = Field(default_factory=list)
    unknowns: list[str] = Field(default_factory=list)
    graph_explanation: str | None = None
    receipt_summary: str | None = None


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
    # Reasoning and autonomous analyst fields.
    reasoning: dict | None = Field(default=None, description="ReasoningOutput from the LLM-backed reasoning engine")
    autonomous_actions: list[dict] = Field(default_factory=list, description="Proposed actions with approval status")
    org_context_used: bool = Field(default=False, description="Whether organizational context was applied")
    run_receipt: ResearchRunReceipt | None = None
    decision_brief: DecisionBrief | None = None
    change_report: dict | None = Field(default=None, description="Delta vs previous run — new signals, resolved, risk posture change")
