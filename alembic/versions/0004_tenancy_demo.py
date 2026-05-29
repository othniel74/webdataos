"""Add tenants, memberships, demo sessions, and tenant columns.

Revision ID: 0004_tenancy_demo
Revises: 0003_chat_messages
Create Date: 2026-06-03 09:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0004_tenancy_demo"
down_revision = "0003_chat_messages"
branch_labels = None
depends_on = None


TENANT_TABLES = [
    "topics",
    "sources",
    "intelligence_records",
    "change_events",
    "refresh_runs",
    "agent_runs",
    "chat_messages",
    "memory_entries",
    "organizational_contexts",
    "autonomous_actions",
    "outcomes",
]


def upgrade() -> None:
    json_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")

    op.create_table(
        "tenants",
        sa.Column("id", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("tenant_type", sa.String(length=40), nullable=False, server_default="customer"),
        sa.Column("clerk_org_id", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_tenants_clerk_org_id"), "tenants", ["clerk_org_id"], unique=False)

    op.create_table(
        "tenant_memberships",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("tenant_id", sa.String(length=120), nullable=False),
        sa.Column("clerk_user_id", sa.String(length=255), nullable=False),
        sa.Column("clerk_org_id", sa.String(length=255), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("role", sa.String(length=40), nullable=False, server_default="analyst"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_tenant_memberships_tenant_id"), "tenant_memberships", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_tenant_memberships_clerk_user_id"), "tenant_memberships", ["clerk_user_id"], unique=False)
    op.create_index(op.f("ix_tenant_memberships_clerk_org_id"), "tenant_memberships", ["clerk_org_id"], unique=False)

    op.create_table(
        "demo_sessions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("tenant_id", sa.String(length=120), nullable=False),
        sa.Column("workspace_id", sa.String(length=120), nullable=False),
        sa.Column("mission", sa.String(length=80), nullable=False, server_default="vendor_risk"),
        sa.Column("entities", json_type, nullable=False, server_default="[]"),
        sa.Column("watch_types", json_type, nullable=False, server_default="[]"),
        sa.Column("runs_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("chat_turns_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_demo_sessions_tenant_id"), "demo_sessions", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_demo_sessions_workspace_id"), "demo_sessions", ["workspace_id"], unique=False)

    op.bulk_insert(
        sa.table(
            "tenants",
            sa.column("id", sa.String),
            sa.column("name", sa.String),
            sa.column("tenant_type", sa.String),
            sa.column("status", sa.String),
        ),
        [
            {"id": "tenant_internal", "name": "Internal WebDataOS", "tenant_type": "internal", "status": "active"},
            {"id": "tenant_demo", "name": "Public Demo", "tenant_type": "demo", "status": "active"},
        ],
    )

    for table in TENANT_TABLES:
        op.add_column(
            table,
            sa.Column("tenant_id", sa.String(length=120), nullable=False, server_default="tenant_internal"),
        )
        op.create_index(op.f(f"ix_{table}_tenant_id"), table, ["tenant_id"], unique=False)


def downgrade() -> None:
    for table in reversed(TENANT_TABLES):
        op.drop_index(op.f(f"ix_{table}_tenant_id"), table_name=table)
        op.drop_column(table, "tenant_id")

    op.drop_index(op.f("ix_demo_sessions_workspace_id"), table_name="demo_sessions")
    op.drop_index(op.f("ix_demo_sessions_tenant_id"), table_name="demo_sessions")
    op.drop_table("demo_sessions")

    op.drop_index(op.f("ix_tenant_memberships_clerk_org_id"), table_name="tenant_memberships")
    op.drop_index(op.f("ix_tenant_memberships_clerk_user_id"), table_name="tenant_memberships")
    op.drop_index(op.f("ix_tenant_memberships_tenant_id"), table_name="tenant_memberships")
    op.drop_table("tenant_memberships")

    op.drop_index(op.f("ix_tenants_clerk_org_id"), table_name="tenants")
    op.drop_table("tenants")
