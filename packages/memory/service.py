"""Self-hosted evidence memory service.

Fallback/merge layer for CogneeMemoryService with the same interface.
Uses PostgreSQL for persistence and OpenAI embeddings for semantic search.

Architecture:
    ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
    │  Upsert     │────▶│  Embed text  │────▶│  Store in    │
    │  (content)  │     │  (OpenAI)    │     │  PostgreSQL  │
    └─────────────┘     └──────────────┘     └──────────────┘

    ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
    │  Search     │────▶│  Embed query │────▶│  Cosine sim  │
    │  (query)    │     │  (OpenAI)    │     │  + rank      │
    └─────────────┘     └──────────────┘     └──────────────┘

When OPENAI_API_KEY is not set, search falls back to keyword matching.
The system works at every level of integration.
"""
from __future__ import annotations

import math
import uuid
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.db.models import MemoryEntry, Topic
from packages.common.logging import get_logger
from packages.memory.embeddings import EmbeddingClient
from packages.schemas.partners import MemoryRecord, MemorySearchRequest, MemoryUpsertRequest

logger = get_logger(__name__)


def _cosine_similarity(a: Sequence[float], b: Sequence[float]) -> float:
    """Compute cosine similarity between two vectors."""
    if len(a) != len(b) or not a:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


class MemoryService:
    """Persistent, embedding-backed memory service.

    Provides the self-hosted fallback side of the Cognee + WebDataOS memory interface:
        - upsert(MemoryUpsertRequest) -> MemoryRecord
        - search(MemorySearchRequest) -> list[MemoryRecord]

    Uses OpenAI embeddings for semantic search when available.
    Falls back to keyword matching when no API key is configured.
    """

    def __init__(self, embedder: EmbeddingClient | None = None) -> None:
        self.embedder = embedder or EmbeddingClient()

    async def upsert(self, db: AsyncSession, request: MemoryUpsertRequest) -> MemoryRecord:
        """Store or update a memory record.

        If a record with the same workspace_id + entity exists, updates it.
        Otherwise creates a new one. Embeds the content when OpenAI is available.
        """
        # Check for existing memory for this workspace + entity
        result = await db.execute(
            select(MemoryEntry).where(
                MemoryEntry.workspace_id == request.workspace_id,
                MemoryEntry.entity == request.entity,
            ).order_by(MemoryEntry.updated_at.desc()).limit(1)
        )
        existing = result.scalar_one_or_none()

        # Generate embedding if available
        embedding = None
        if self.embedder.available:
            try:
                embedding = await self.embedder.embed(request.content)
                logger.info("memory_embedded", entity=request.entity, dimensions=len(embedding))
            except Exception as exc:
                logger.warning("memory_embedding_failed", error=str(exc))

        if existing:
            existing.content = request.content
            existing.evidence_urls = request.evidence_urls
            existing.metadata_json = request.metadata
            existing.embedding = embedding
            await db.commit()
            return self._to_record(existing)

        entry = MemoryEntry(
            id=f"mem_{uuid.uuid4().hex[:12]}",
            tenant_id=await self._tenant_id(db, request.workspace_id),
            workspace_id=request.workspace_id,
            entity=request.entity,
            content=request.content,
            evidence_urls=request.evidence_urls,
            metadata_json=request.metadata,
            embedding=embedding,
        )
        db.add(entry)
        await db.commit()
        logger.info("memory_stored", id=entry.id, entity=request.entity, has_embedding=embedding is not None)
        return self._to_record(entry)

    async def _tenant_id(self, db: AsyncSession, workspace_id: str) -> str:
        topic = await db.get(Topic, workspace_id)
        return topic.tenant_id if topic else "tenant_internal"

    async def search(self, db: AsyncSession, request: MemorySearchRequest) -> list[MemoryRecord]:
        """Search memory records by semantic similarity or keyword matching.

        When embeddings are available:
            1. Embed the query
            2. Load all memories for the workspace
            3. Compute cosine similarity
            4. Return top_k ranked by score

        When embeddings are not available:
            1. Keyword match against entity + content
            2. Return matches ranked by recency
        """
        # Load candidate memories for this workspace
        result = await db.execute(
            select(MemoryEntry)
            .where(MemoryEntry.workspace_id == request.workspace_id)
            .order_by(MemoryEntry.updated_at.desc())
            .limit(100)
        )
        candidates = result.scalars().all()

        if not candidates:
            return []

        # Semantic search path
        if self.embedder.available:
            try:
                query_embedding = await self.embedder.embed(request.query)
                scored = []
                for entry in candidates:
                    if entry.embedding:
                        sim = _cosine_similarity(query_embedding, entry.embedding)
                        # Boost score if entity matches
                        entity_boost = 0.1 if entry.entity.lower() in {e.lower() for e in request.entities} else 0.0
                        scored.append((entry, sim + entity_boost))
                    else:
                        # No embedding — fall back to keyword score for this entry
                        kw_score = self._keyword_score(request.query, request.entities, entry)
                        scored.append((entry, kw_score))

                scored.sort(key=lambda x: x[1], reverse=True)
                return [self._to_record(entry, score) for entry, score in scored[:request.top_k] if score > 0.1]
            except Exception as exc:
                logger.warning("semantic_search_failed, falling back to keyword", error=str(exc))

        # Keyword search fallback
        matches = []
        for entry in candidates:
            score = self._keyword_score(request.query, request.entities, entry)
            if score > 0.0:
                matches.append((entry, score))

        matches.sort(key=lambda x: x[1], reverse=True)
        return [self._to_record(entry, score) for entry, score in matches[:request.top_k]]

    async def list_memories(self, db: AsyncSession, workspace_id: str, limit: int = 50) -> list[MemoryRecord]:
        """List all memories for a workspace, most recent first."""
        result = await db.execute(
            select(MemoryEntry)
            .where(MemoryEntry.workspace_id == workspace_id)
            .order_by(MemoryEntry.updated_at.desc())
            .limit(limit)
        )
        return [self._to_record(entry) for entry in result.scalars().all()]

    async def delete(self, db: AsyncSession, memory_id: str) -> bool:
        """Delete a specific memory entry."""
        entry = await db.get(MemoryEntry, memory_id)
        if not entry:
            return False
        await db.delete(entry)
        await db.commit()
        return True

    async def clear_workspace(self, db: AsyncSession, workspace_id: str) -> int:
        """Delete all memories for a workspace. Returns count deleted."""
        result = await db.execute(
            select(MemoryEntry).where(MemoryEntry.workspace_id == workspace_id)
        )
        entries = result.scalars().all()
        for entry in entries:
            await db.delete(entry)
        await db.commit()
        return len(entries)

    def _keyword_score(self, query: str, entities: list[str], entry: MemoryEntry) -> float:
        """Simple keyword matching score."""
        query_lower = query.lower()
        haystack = f"{entry.entity} {entry.content}".lower()
        entity_terms = {e.lower() for e in entities}

        score = 0.0
        # Query term matching
        query_words = query_lower.split()
        if query_words:
            matched = sum(1 for w in query_words if w in haystack)
            score += (matched / len(query_words)) * 0.6

        # Entity matching
        if entry.entity.lower() in entity_terms:
            score += 0.3
        if any(term in haystack for term in entity_terms):
            score += 0.1

        return min(score, 1.0)

    def _to_record(self, entry: MemoryEntry, score: float = 1.0) -> MemoryRecord:
        return MemoryRecord(
            memory_id=entry.id,
            provider="webdataos_memory",
            workspace_id=entry.workspace_id,
            entity=entry.entity,
            content=entry.content,
            evidence_urls=entry.evidence_urls or [],
            score=round(score, 4),
        )
