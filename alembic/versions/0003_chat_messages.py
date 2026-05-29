"""Add durable workspace chat messages.

Revision ID: 0003_chat_messages
Revises: 0002_v2_tables
Create Date: 2026-06-02 01:05:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0003_chat_messages"
down_revision = "0002_v2_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    json_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("workspace_id", sa.String(length=120), nullable=False),
        sa.Column("role", sa.String(length=24), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("run_id", sa.String(length=64), nullable=True),
        sa.Column("metadata_json", json_type, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_chat_messages_workspace_id"), "chat_messages", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_chat_messages_run_id"), "chat_messages", ["run_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_chat_messages_run_id"), table_name="chat_messages")
    op.drop_index(op.f("ix_chat_messages_workspace_id"), table_name="chat_messages")
    op.drop_table("chat_messages")
