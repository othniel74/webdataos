"""add v2 tables: memory_entries, organizational_contexts, autonomous_actions, outcomes

Revision ID: 0002_v2_tables
Revises: 0001_initial_schema
Create Date: 2026-05-29
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002_v2_tables"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Self-hosted memory fallback/merge layer for Cognee
    op.create_table("memory_entries",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("workspace_id", sa.String(length=120), nullable=False),
        sa.Column("entity", sa.String(length=255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("evidence_urls", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("embedding", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_memory_entries_workspace_id", "memory_entries", ["workspace_id"])
    op.create_index("ix_memory_entries_entity", "memory_entries", ["entity"])

    # Organizational context for materiality assessment
    op.create_table("organizational_contexts",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("workspace_id", sa.String(length=120), nullable=False),
        sa.Column("contracts", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("risk_thresholds", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("financial_exposure", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("renewal_calendar", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("strategic_priorities", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("compliance_requirements", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_org_contexts_workspace_id", "organizational_contexts", ["workspace_id"], unique=True)

    # Autonomous actions with approval gates
    op.create_table("autonomous_actions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("workspace_id", sa.String(length=120), nullable=False),
        sa.Column("run_id", sa.String(length=64), nullable=True),
        sa.Column("recommendation_id", sa.String(length=64), nullable=True),
        sa.Column("action_type", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="pending_approval"),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("approved_by", sa.String(length=255), nullable=True),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_actions_workspace_id", "autonomous_actions", ["workspace_id"])
    op.create_index("ix_actions_run_id", "autonomous_actions", ["run_id"])

    # Outcome tracking for learning loop
    op.create_table("outcomes",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("workspace_id", sa.String(length=120), nullable=False),
        sa.Column("event_id", sa.String(length=64), nullable=True),
        sa.Column("action_id", sa.String(length=64), nullable=True),
        sa.Column("run_id", sa.String(length=64), nullable=True),
        sa.Column("entity_name", sa.String(length=255), nullable=True),
        sa.Column("signal_type", sa.String(length=80), nullable=True),
        sa.Column("outcome_type", sa.String(length=80), nullable=False),
        sa.Column("outcome_value", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("feedback_text", sa.Text(), nullable=True),
        sa.Column("recorded_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_outcomes_workspace_id", "outcomes", ["workspace_id"])
    op.create_index("ix_outcomes_event_id", "outcomes", ["event_id"])
    op.create_index("ix_outcomes_action_id", "outcomes", ["action_id"])


def downgrade() -> None:
    op.drop_table("outcomes")
    op.drop_table("autonomous_actions")
    op.drop_table("organizational_contexts")
    op.drop_table("memory_entries")
