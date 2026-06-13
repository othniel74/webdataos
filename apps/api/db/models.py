from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

JSONType = JSON().with_variant(JSONB, "postgresql")


class Base(DeclarativeBase):
    pass


class Tenant(Base):
    __tablename__ = "tenants"
    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    tenant_type: Mapped[str] = mapped_column(String(40), default="customer")
    clerk_org_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(50), default="active")
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class TenantMembership(Base):
    __tablename__ = "tenant_memberships"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(120), index=True)
    clerk_user_id: Mapped[str] = mapped_column(String(255), index=True)
    clerk_org_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(40), default="analyst")
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserAccount(Base):
    __tablename__ = "user_accounts"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(120), index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(String(40), default="admin")
    status: Mapped[str] = mapped_column(String(40), default="active")
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DemoSession(Base):
    __tablename__ = "demo_sessions"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(120), index=True)
    workspace_id: Mapped[str] = mapped_column(String(120), index=True)
    mission: Mapped[str] = mapped_column(String(80), default="vendor_risk")
    entities: Mapped[list] = mapped_column(JSONType, default=list)
    watch_types: Mapped[list] = mapped_column(JSONType, default=list)
    runs_used: Mapped[int] = mapped_column(Integer, default=0)
    chat_turns_used: Mapped[int] = mapped_column(Integer, default=0)
    expires_at = mapped_column(DateTime(timezone=True), nullable=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Topic(Base):
    __tablename__ = "topics"
    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(120), default="tenant_internal", index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    entities: Mapped[list] = mapped_column(JSONType, default=list)
    watch_types: Mapped[list] = mapped_column(JSONType, default=list)
    refresh_frequency_minutes: Mapped[int] = mapped_column(Integer, default=1440)
    next_run_at = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())

    sources: Mapped[list["Source"]] = relationship(back_populates="topic", cascade="all, delete-orphan")


class Source(Base):
    __tablename__ = "sources"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(120), default="tenant_internal", index=True)
    topic_id: Mapped[str] = mapped_column(ForeignKey("topics.id", ondelete="CASCADE"), index=True)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(Text)
    snippet: Mapped[str | None] = mapped_column(Text)
    source_type: Mapped[str] = mapped_column(String(80), default="unknown")
    authority: Mapped[str] = mapped_column(String(80), default="unknown")
    status: Mapped[str] = mapped_column(String(50), default="active")
    last_checked = mapped_column(DateTime(timezone=True), nullable=True)
    next_refresh_due = mapped_column(DateTime(timezone=True), nullable=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())

    topic: Mapped[Topic] = relationship(back_populates="sources")


class IntelligenceRecord(Base):
    __tablename__ = "intelligence_records"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(120), default="tenant_internal", index=True)
    topic_id: Mapped[str] = mapped_column(String(120), index=True)
    source_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    entity_name: Mapped[str | None] = mapped_column(String(255), index=True)
    entity_type: Mapped[str | None] = mapped_column(String(80))
    source_url: Mapped[str] = mapped_column(Text)
    source_type: Mapped[str] = mapped_column(String(80), default="unknown")
    facts_json: Mapped[dict] = mapped_column(JSONType, default=dict)
    summary: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    freshness_status: Mapped[str] = mapped_column(String(50), default="unknown")
    source_tier: Mapped[int] = mapped_column(Integer, default=3)
    embedding_text: Mapped[str | None] = mapped_column(Text)
    last_checked = mapped_column(DateTime(timezone=True), nullable=True)
    extracted_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class ChangeEvent(Base):
    __tablename__ = "change_events"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(120), default="tenant_internal", index=True)
    topic_id: Mapped[str] = mapped_column(String(120), index=True)
    record_id: Mapped[str] = mapped_column(String(64), index=True)
    change_type: Mapped[str] = mapped_column(String(80))
    field: Mapped[str | None] = mapped_column(String(120))
    old_value: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    new_value: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    detected_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class RefreshRun(Base):
    __tablename__ = "refresh_runs"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(120), default="tenant_internal", index=True)
    topic_id: Mapped[str] = mapped_column(String(120), index=True)
    status: Mapped[str] = mapped_column(String(50))
    sources_checked: Mapped[int] = mapped_column(Integer, default=0)
    records_created: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    started_at = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at = mapped_column(DateTime(timezone=True), nullable=True)


class AgentRun(Base):
    __tablename__ = "agent_runs"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(120), default="tenant_internal", index=True)
    topic_id: Mapped[str] = mapped_column(String(120), index=True)
    task: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50))
    report_json: Mapped[dict] = mapped_column(JSONType, default=dict)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


# ── Self-hosted Memory (fallback/merge layer for Cognee) ─────────────

class ChatMessage(Base):
    """Durable analyst chat message for a workspace.

    Agent runs are immutable receipts; chat messages preserve the working
    conversation that produced those runs.
    """
    __tablename__ = "chat_messages"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(120), default="tenant_internal", index=True)
    workspace_id: Mapped[str] = mapped_column(String(120), index=True)
    role: Mapped[str] = mapped_column(String(24))
    content: Mapped[str] = mapped_column(Text)
    run_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSONType, default=dict)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class MemoryEntry(Base):
    """Persistent memory record with optional embedding vector.

    When OPENAI_API_KEY is set, content is embedded on upsert and
    search uses cosine similarity. Without embeddings, search falls
    back to keyword matching against entity + content fields.
    """
    __tablename__ = "memory_entries"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(120), default="tenant_internal", index=True)
    workspace_id: Mapped[str] = mapped_column(String(120), index=True)
    entity: Mapped[str] = mapped_column(String(255), index=True)
    content: Mapped[str] = mapped_column(Text)
    evidence_urls: Mapped[list] = mapped_column(JSONType, default=list)
    metadata_json: Mapped[dict] = mapped_column(JSONType, default=dict)
    embedding: Mapped[list | None] = mapped_column(JSONType, nullable=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ── Phase 1: Organizational Context ──────────────────────────────────

class OrganizationalContext(Base):
    """Stores per-workspace organizational context for materiality assessment."""
    __tablename__ = "organizational_contexts"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(120), default="tenant_internal", index=True)
    workspace_id: Mapped[str] = mapped_column(String(120), index=True, unique=True)
    contracts: Mapped[list] = mapped_column(JSONType, default=list)
    risk_thresholds: Mapped[dict] = mapped_column(JSONType, default=dict)
    financial_exposure: Mapped[dict] = mapped_column(JSONType, default=dict)
    renewal_calendar: Mapped[list] = mapped_column(JSONType, default=list)
    strategic_priorities: Mapped[list] = mapped_column(JSONType, default=list)
    compliance_requirements: Mapped[list] = mapped_column(JSONType, default=list)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ── Phase 3: Autonomous Actions ──────────────────────────────────────

class AutonomousAction(Base):
    """Actions the system proposes or executes with human approval gates."""
    __tablename__ = "autonomous_actions"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(120), default="tenant_internal", index=True)
    workspace_id: Mapped[str] = mapped_column(String(120), index=True)
    run_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    recommendation_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    action_type: Mapped[str] = mapped_column(String(80))  # draft_email, schedule_review, update_risk_register, file_report
    status: Mapped[str] = mapped_column(String(50), default="pending_approval")  # pending_approval, approved, executed, rejected, expired
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(JSONType, default=dict)
    approved_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    executed_at = mapped_column(DateTime(timezone=True), nullable=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


# ── Phase 4: Outcome Tracking ────────────────────────────────────────

class Outcome(Base):
    """Records what happened after an alert/recommendation was acted on."""
    __tablename__ = "outcomes"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(120), default="tenant_internal", index=True)
    workspace_id: Mapped[str] = mapped_column(String(120), index=True)
    event_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    action_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    run_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    entity_name: Mapped[str | None] = mapped_column(String(255))
    signal_type: Mapped[str | None] = mapped_column(String(80))
    outcome_type: Mapped[str] = mapped_column(String(80))  # acted, dismissed, deferred, false_alarm, confirmed_useful
    outcome_value: Mapped[dict] = mapped_column(JSONType, default=dict)  # e.g. {"savings": 47000, "risk_mitigated": true}
    feedback_text: Mapped[str | None] = mapped_column(Text)
    recorded_by: Mapped[str | None] = mapped_column(String(255))
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


# ── Audit Logging ─────────────────────────────────────────────────────

class AuditLog(Base):
    """Immutable record of who accessed or mutated what and when."""
    __tablename__ = "audit_logs"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(120), index=True)
    principal: Mapped[str] = mapped_column(String(255))
    auth_type: Mapped[str] = mapped_column(String(40))
    method: Mapped[str] = mapped_column(String(10))
    path: Mapped[str] = mapped_column(String(500))
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(60), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


# ── API Key Management ────────────────────────────────────────────────

class ManagedAPIKey(Base):
    """Per-tenant API keys that can be created, listed, and revoked via the API."""
    __tablename__ = "managed_api_keys"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(120), index=True)
    name: Mapped[str] = mapped_column(String(255))
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    key_prefix: Mapped[str] = mapped_column(String(20))
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_used_at = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at = mapped_column(DateTime(timezone=True), nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())
