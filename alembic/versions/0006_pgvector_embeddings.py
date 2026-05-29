"""Add pgvector column for real similarity search on memory entries.

Revision ID: 0006
Revises: 0005_custom_auth
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005_custom_auth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Install pgvector extension (requires superuser on first run)
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Add vector column to memory_entries (1536 dims = text-embedding-3-small)
    op.execute(
        "ALTER TABLE memory_entries ADD COLUMN IF NOT EXISTS embedding_vector vector(1536)"
    )

    # Index for cosine similarity search
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_memory_entries_embedding_vector
        ON memory_entries
        USING ivfflat (embedding_vector vector_cosine_ops)
        WITH (lists = 100)
        """
    )

    # Add vector column to intelligence_records for retrieval ranking
    op.execute(
        "ALTER TABLE intelligence_records ADD COLUMN IF NOT EXISTS embedding_vector vector(1536)"
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_intelligence_records_embedding_vector
        ON intelligence_records
        USING ivfflat (embedding_vector vector_cosine_ops)
        WITH (lists = 100)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_memory_entries_embedding_vector")
    op.execute("DROP INDEX IF EXISTS ix_intelligence_records_embedding_vector")
    op.execute("ALTER TABLE memory_entries DROP COLUMN IF EXISTS embedding_vector")
    op.execute("ALTER TABLE intelligence_records DROP COLUMN IF EXISTS embedding_vector")
