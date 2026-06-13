"""Add source_tier column to intelligence_records for source quality tiering (Gap 3).

Revision ID: 0009
Revises: 0008
"""
from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "intelligence_records",
        sa.Column("source_tier", sa.Integer(), nullable=False, server_default="3"),
    )


def downgrade() -> None:
    op.drop_column("intelligence_records", "source_tier")
