"""Schemas for organizational context, materiality assessment, and LLM-backed reasoning."""
from __future__ import annotations

from pydantic import BaseModel, Field


# ── Phase 1: Organizational Context ──────────────────────────────────

class ContractMeta(BaseModel):
    entity_name: str
    vendor_type: str = "vendor"  # vendor, supplier, partner, competitor
    annual_value: float | None = None
    currency: str = "USD"
    renewal_date: str | None = None  # ISO date
    auto_renew: bool = False
    risk_tier: str = "medium"  # low, medium, high, critical
    data_sensitivity: str = "standard"  # standard, pii, regulated, classified
    notes: str | None = None


class RiskThresholds(BaseModel):
    pricing_change_pct: float = Field(default=5.0, description="% change in pricing that triggers materiality")
    breach_severity_min: str = Field(default="medium", description="Minimum breach severity to flag")
    compliance_deadline_days: int = Field(default=30, description="Days before deadline to alert")
    vendor_risk_score_floor: float = Field(default=0.6, description="Minimum risk score to flag")
    financial_impact_floor: float = Field(default=10000.0, description="Minimum $ impact to flag")


class FinancialExposure(BaseModel):
    total_vendor_spend: float = 0.0
    revenue_at_risk: float = 0.0
    cost_of_breach_estimate: float = 0.0
    currency: str = "USD"


class OrgContextCreate(BaseModel):
    workspace_id: str
    contracts: list[ContractMeta] = Field(default_factory=list)
    risk_thresholds: RiskThresholds = Field(default_factory=RiskThresholds)
    financial_exposure: FinancialExposure = Field(default_factory=FinancialExposure)
    renewal_calendar: list[dict] = Field(default_factory=list)
    strategic_priorities: list[str] = Field(default_factory=list)
    compliance_requirements: list[str] = Field(default_factory=list)


class OrgContextRead(OrgContextCreate):
    id: str
    created_at: str | None = None
    updated_at: str | None = None


# ── Phase 2: Reasoning & Recommendations ─────────────────────────────

class MaterialityAssessment(BaseModel):
    finding: str
    materiality: str  # critical, high, medium, low, informational
    impact_description: str
    financial_impact: float | None = None
    affected_contracts: list[str] = Field(default_factory=list)
    urgency: str = "standard"  # immediate, urgent, standard, low
    evidence_ids: list[str] = Field(default_factory=list)


class Recommendation(BaseModel):
    id: str
    title: str
    description: str
    reasoning: str
    materiality: str  # critical, high, medium, low
    confidence: float = 0.0
    evidence_chain: list[str] = Field(default_factory=list)
    suggested_actions: list[str] = Field(default_factory=list)
    affected_entities: list[str] = Field(default_factory=list)
    financial_impact: float | None = None
    deadline: str | None = None
    framework_used: str | None = None


class ReasoningOutput(BaseModel):
    """Output from the LLM-backed reasoning engine."""
    materiality_assessments: list[MaterialityAssessment] = Field(default_factory=list)
    recommendations: list[Recommendation] = Field(default_factory=list)
    executive_summary: str = ""
    risk_posture: str = "stable"  # improving, stable, degrading, critical
    confidence: float = 0.0
    reasoning_trace: list[str] = Field(default_factory=list)


# ── Phase 3: Autonomous Actions ──────────────────────────────────────

class ActionProposal(BaseModel):
    action_type: str  # draft_email, schedule_review, update_risk_register, file_report, notify_team
    title: str
    description: str
    payload: dict = Field(default_factory=dict)
    recommendation_id: str | None = None
    requires_approval: bool = True
    urgency: str = "standard"


class ActionRead(BaseModel):
    id: str
    workspace_id: str
    run_id: str | None = None
    recommendation_id: str | None = None
    action_type: str
    status: str
    title: str
    description: str | None = None
    payload: dict = Field(default_factory=dict)
    approved_by: str | None = None
    executed_at: str | None = None
    created_at: str | None = None


class ActionApproval(BaseModel):
    approved_by: str
    approve: bool = True
    feedback: str | None = None


# ── Phase 4: Outcomes ────────────────────────────────────────────────

class OutcomeRecord(BaseModel):
    workspace_id: str
    event_id: str | None = None
    action_id: str | None = None
    run_id: str | None = None
    entity_name: str | None = None
    signal_type: str | None = None
    outcome_type: str  # acted, dismissed, deferred, false_alarm, confirmed_useful
    outcome_value: dict = Field(default_factory=dict)
    feedback_text: str | None = None
    recorded_by: str | None = None


class OutcomeRead(OutcomeRecord):
    id: str
    created_at: str | None = None


class OutcomeStats(BaseModel):
    workspace_id: str
    total_outcomes: int = 0
    acted: int = 0
    dismissed: int = 0
    false_alarms: int = 0
    confirmed_useful: int = 0
    hit_rate: float = 0.0
    signal_accuracy: dict = Field(default_factory=dict)
    entity_accuracy: dict = Field(default_factory=dict)
