"""Memory provider — routes between Cognee and self-hosted memory.

Priority:
    1. Cognee (if cognee is installed — pip install cognee)
    2. Self-hosted with embeddings (if OPENAI_API_KEY is set)
    3. Self-hosted with keyword matching (always available)

Both providers implement the same interface:
    - upsert(request) -> MemoryRecord
    - search(request) -> list[MemoryRecord]

The provider writes to BOTH when Cognee is available — Cognee gets the
knowledge graph, self-hosted gets the vector store. This means search
can use Cognee's graph reasoning AND self-hosted embedding similarity.
"""
from __future__ import annotations

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.logging import get_logger
from packages.memory.service import MemoryService
from packages.partners.cognee import CogneeMemoryService
from packages.schemas.partners import MemoryRecord, MemorySearchRequest, MemoryUpsertRequest

logger = get_logger(__name__)


class MemoryProvider:
    """Unified memory interface — Cognee primary, self-hosted fallback.

    When Cognee is available:
        - upsert writes to both Cognee and self-hosted
        - search queries Cognee first; if empty, falls back to self-hosted

    When Cognee is not available:
        - Everything goes through self-hosted (embeddings or keyword matching)
    """

    def __init__(
        self,
        cognee: CogneeMemoryService | None = None,
        self_hosted: MemoryService | None = None,
    ) -> None:
        self.cognee = cognee or CogneeMemoryService()
        self.self_hosted = self_hosted or MemoryService()

    @property
    def provider_name(self) -> str:
        if self.cognee.available:
            return "cognee+self_hosted"
        return "self_hosted"

    async def upsert(self, db: AsyncSession, request: MemoryUpsertRequest) -> MemoryRecord:
        """Store in both Cognee and self-hosted for maximum coverage."""
        # Always store in self-hosted (persistent, searchable)
        record = await self.self_hosted.upsert(db, request)

        # Also store in Cognee if available (knowledge graph)
        if self.cognee.available:
            try:
                await asyncio.wait_for(
                    self.cognee.upsert(request),
                    timeout=self.cognee.settings.cognee_timeout_seconds,
                )
                logger.info("memory_dual_write", cognee=True, self_hosted=True)
                # Return the Cognee record ID but with self-hosted content
                record.provider = "cognee+self_hosted"
            except TimeoutError:
                self.cognee.disable("upsert_timeout")
                logger.warning("cognee_upsert_timeout_in_provider")
            except Exception as exc:
                self.cognee.disable(str(exc))
                logger.warning("cognee_upsert_failed_in_provider", error=str(exc))

        return record

    async def search(self, db: AsyncSession, request: MemorySearchRequest) -> list[MemoryRecord]:
        """Search Cognee first, merge with self-hosted results."""

        results = []

        # Try Cognee first
        if self.cognee.available:
            try:
                cognee_results = await asyncio.wait_for(
                    self.cognee.search(request),
                    timeout=self.cognee.settings.cognee_timeout_seconds,
                )
                if cognee_results:
                    results.extend(cognee_results)
                    logger.info("memory_search_cognee", results=len(cognee_results))
            except TimeoutError:
                self.cognee.disable("search_timeout")
                logger.warning("cognee_search_timeout_in_provider")
            except Exception as exc:
                self.cognee.disable(str(exc))
                logger.warning("cognee_search_failed_in_provider", error=str(exc))

        # Also search self-hosted (embeddings or keyword)
        try:
            sh_results = await self.self_hosted.search(db, request)
            if sh_results:
                # Merge — deduplicate by content similarity (simple: check entity match)
                existing_entities = {r.entity.lower() for r in results}
                for r in sh_results:
                    if r.entity.lower() not in existing_entities:
                        results.append(r)
                        existing_entities.add(r.entity.lower())
        except Exception as exc:
            logger.warning("self_hosted_search_failed", error=str(exc))

        # Sort by score descending, limit to top_k
        results.sort(key=lambda r: r.score, reverse=True)
        return results[:request.top_k]

    async def forget(self, db: AsyncSession, workspace_id: str) -> None:
        """Clear memory from both providers."""
        if self.cognee.available:
            try:
                await self.cognee.forget(workspace_id)
            except Exception:
                pass

        await self.self_hosted.clear_workspace(db, workspace_id)
