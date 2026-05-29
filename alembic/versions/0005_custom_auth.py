"""Add first-party user accounts.

Revision ID: 0005_custom_auth
Revises: 0004_tenancy_demo
Create Date: 2026-05-29 20:40:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_custom_auth"
down_revision = "0004_tenancy_demo"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_accounts",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("tenant_id", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", sa.String(length=40), nullable=False, server_default="admin"),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index(op.f("ix_user_accounts_tenant_id"), "user_accounts", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_user_accounts_email"), "user_accounts", ["email"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_accounts_email"), table_name="user_accounts")
    op.drop_index(op.f("ix_user_accounts_tenant_id"), table_name="user_accounts")
    op.drop_table("user_accounts")
