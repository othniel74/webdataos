"""Cognee memory adapter — uses the Cognee SDK for knowledge graph memory.

Cognee is open source (pip install cognee). It provides:
    - cognee.remember(text) — store in knowledge graph
    - cognee.recall(query) — semantic search
    - cognee.forget(dataset) — delete

When COGNEE_ENDPOINT and COGNEE_API_KEY are set, connects to Cognee Cloud.
Otherwise runs locally with the installed cognee package.

Requires: LLM_API_KEY env var for the underlying LLM.
"""
from __future__ import annotations

import os
import uuid

from packages.common.config import get_settings
from packages.common.logging import get_logger
from packages.schemas.partners import MemoryRecord, MemorySearchRequest, MemoryUpsertRequest

logger = get_logger(__name__)


class CogneeMemoryService:
    """Cognee SDK adapter matching the WebDataOS memory interface."""

    def __init__(self) -> None:
        self._initialized = False
        self._available = False
        self._check_availability()

    def _check_availability(self) -> None:
        """Check if cognee is installed and configurable."""
        try:
            import cognee  # noqa: F401
            self._available = True
            logger.info("cognee_sdk_found")
        except ImportError:
            self._available = False
            logger.warning("cognee_sdk_not_installed — pip install cognee")

    @property
    def available(self) -> bool:
        return self._available

    async def _ensure_init(self) -> None:
        """Initialize Cognee on first use — set LLM key and optional cloud connection."""
        if self._initialized:
            return

        settings = get_settings()

        # Set the LLM API key Cognee needs
        if settings.openai_api_key:
            os.environ.setdefault("LLM_API_KEY", settings.openai_api_key)

        # Connect to Cognee Cloud if endpoint is configured
        if settings.cognee_endpoint and settings.cognee_api_key:
            import cognee
            await cognee.serve(
                url=settings.cognee_endpoint,
                api_key=settings.cognee_api_key,
            )
            logger.info("cognee_cloud_connected", endpoint=settings.cognee_endpoint)

        self._initialized = True

    async def upsert(self, request: MemoryUpsertRequest) -> MemoryRecord:
        """Store content in Cognee's knowledge graph via cognee.remember()."""
        if not self._available:
            return self._mock_record(request)

        await self._ensure_init()

        import cognee

        # Format content with metadata for richer graph storage
        content = (
            f"[workspace:{request.workspace_id}] "
            f"[entity:{request.entity}] "
            f"{request.content}"
        )
        if request.evidence_urls:
            content += f"\nSources: {', '.join(request.evidence_urls[:5])}"

        try:
            await cognee.remember(content)
            logger.info("cognee_remember", entity=request.entity, workspace=request.workspace_id)
        except Exception as exc:
            logger.error("cognee_remember_failed", error=str(exc))

        return MemoryRecord(
            memory_id=f"cog_{uuid.uuid4().hex[:12]}",
            provider="cognee",
            workspace_id=request.workspace_id,
            entity=request.entity,
            content=request.content,
            evidence_urls=request.evidence_urls,
            score=1.0,
        )

    async def search(self, request: MemorySearchRequest) -> list[MemoryRecord]:
        """Search Cognee's knowledge graph via cognee.recall()."""
        if not self._available:
            return []

        await self._ensure_init()

        import cognee

        query = f"{request.query}"
        if request.entities:
            query += f" entities: {', '.join(request.entities)}"

        try:
            results = await cognee.recall(query)
            records = []
            for i, result in enumerate(results or []):
                text = str(result) if not isinstance(result, str) else result
                entity = request.entities[0] if request.entities else "unknown"
                records.append(MemoryRecord(
                    memory_id=f"cog_{uuid.uuid4().hex[:8]}_{i}",
                    provider="cognee",
                    workspace_id=request.workspace_id,
                    entity=entity,
                    content=text[:1000],
                    evidence_urls=[],
                    score=round(0.9 - (i * 0.05), 3),
                ))
            logger.info("cognee_recall", query=request.query[:50], results=len(records))
            return records[:request.top_k]
        except Exception as exc:
            logger.error("cognee_recall_failed", error=str(exc))
            return []

    async def forget(self, workspace_id: str) -> None:
        """Clear memory for a workspace via cognee.forget()."""
        if not self._available:
            return

        await self._ensure_init()

        import cognee

        try:
            await cognee.forget(dataset=workspace_id)
            logger.info("cognee_forget", workspace=workspace_id)
        except Exception as exc:
            logger.error("cognee_forget_failed", error=str(exc))

    def _mock_record(self, request: MemoryUpsertRequest) -> MemoryRecord:
        return MemoryRecord(
            memory_id=f"cog_mock_{uuid.uuid4().hex[:8]}",
            provider="cognee",
            workspace_id=request.workspace_id,
            entity=request.entity,
            content=request.content,
            evidence_urls=request.evidence_urls,
            score=1.0,
        )

    def _mock_search_record(self, request: MemorySearchRequest) -> MemoryRecord:
        return MemoryRecord(
            memory_id="cog_mock_fallback",
            provider="cognee",
            workspace_id=request.workspace_id,
            entity=request.entities[0] if request.entities else "enterprise_context",
            content=f"Cognee memory context for: {request.query[:80]}",
            evidence_urls=[],
            score=0.74,
        )
