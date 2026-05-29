"""Add topics.next_run_at for scheduled monitoring and managed_api_keys.expires_at for key expiry.

Revision ID: 0008
Revises: 0007
"""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("topics", sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_topics_next_run_at", "topics", ["next_run_at"])

    # Backfill: set next_run_at = created_at + refresh_frequency_minutes for all existing topics
    op.execute("""
        UPDATE topics
        SET next_run_at = created_at + (refresh_frequency_minutes * interval '1 minute')
        WHERE next_run_at IS NULL
    """)

    op.add_column("managed_api_keys", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_index("ix_topics_next_run_at", "topics")
    op.drop_column("topics", "next_run_at")
    op.drop_column("managed_api_keys", "expires_at")
