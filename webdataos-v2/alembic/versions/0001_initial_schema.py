"""initial production schema

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("topics",
        sa.Column("id", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("entities", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("watch_types", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("refresh_frequency_minutes", sa.Integer(), nullable=False, server_default="1440"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table("sources",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("topic_id", sa.String(length=120), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("snippet", sa.Text(), nullable=True),
        sa.Column("source_type", sa.String(length=80), nullable=False, server_default="unknown"),
        sa.Column("authority", sa.String(length=80), nullable=False, server_default="unknown"),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="active"),
        sa.Column("last_checked", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_refresh_due", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sources_topic_id", "sources", ["topic_id"])
    op.create_table("intelligence_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("topic_id", sa.String(length=120), nullable=False),
        sa.Column("source_id", sa.String(length=64), nullable=True),
        sa.Column("entity_name", sa.String(length=255), nullable=True),
        sa.Column("entity_type", sa.String(length=80), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("source_type", sa.String(length=80), nullable=False, server_default="unknown"),
        sa.Column("facts_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0"),
        sa.Column("freshness_status", sa.String(length=50), nullable=False, server_default="unknown"),
        sa.Column("embedding_text", sa.Text(), nullable=True),
        sa.Column("last_checked", sa.DateTime(timezone=True), nullable=True),
        sa.Column("extracted_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_intelligence_records_topic_id", "intelligence_records", ["topic_id"])
    op.create_index("ix_intelligence_records_source_id", "intelligence_records", ["source_id"])
    op.create_index("ix_intelligence_records_entity_name", "intelligence_records", ["entity_name"])
    op.create_table("change_events",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("topic_id", sa.String(length=120), nullable=False),
        sa.Column("record_id", sa.String(length=64), nullable=False),
        sa.Column("change_type", sa.String(length=80), nullable=False),
        sa.Column("field", sa.String(length=120), nullable=True),
        sa.Column("old_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("detected_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_change_events_topic_id", "change_events", ["topic_id"])
    op.create_index("ix_change_events_record_id", "change_events", ["record_id"])
    op.create_table("refresh_runs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("topic_id", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("sources_checked", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("records_created", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_refresh_runs_topic_id", "refresh_runs", ["topic_id"])
    op.create_table("agent_runs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("topic_id", sa.String(length=120), nullable=False),
        sa.Column("task", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("report_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_runs_topic_id", "agent_runs", ["topic_id"])


def downgrade() -> None:
    op.drop_table("agent_runs")
    op.drop_table("refresh_runs")
    op.drop_table("change_events")
    op.drop_table("intelligence_records")
    op.drop_table("sources")
    op.drop_table("topics")
