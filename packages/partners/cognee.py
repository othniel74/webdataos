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
import asyncio
from pathlib import Path
import uuid

from packages.common.config import get_settings
from packages.common.logging import get_logger
from packages.schemas.partners import MemoryRecord, MemorySearchRequest, MemoryUpsertRequest

logger = get_logger(__name__)


class CogneeMemoryService:
    """Cognee SDK adapter matching the WebDataOS memory interface."""

    _io_lock = asyncio.Lock()

    def __init__(self) -> None:
        self.settings = get_settings()
        self._initialized = False
        self._available = False
        self._check_availability()

    def _check_availability(self) -> None:
        """Check if cognee is installed and configurable."""
        if not self._has_runtime_config:
            logger.info("cognee_not_configured", reason="missing_llm_or_cloud_configuration")
            return
        self._configure_process_env()
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

    @property
    def _has_runtime_config(self) -> bool:
        return bool(
            (self.settings.cognee_endpoint and self.settings.cognee_api_key)
            or self.settings.openai_api_key
            or self.settings.aimlapi_api_key
            or os.getenv("LLM_API_KEY")
        )

    def _cognee_llm_model(self) -> str:
        if self.settings.cognee_llm_model:
            return self.settings.cognee_llm_model
        if "/" in self.settings.aimlapi_model:
            return self.settings.aimlapi_model
        if self.settings.aimlapi_api_key:
            return f"openai/{self.settings.aimlapi_model}"
        return self.settings.openai_model

    @property
    def _prefer_aimlapi(self) -> bool:
        if not self.settings.aimlapi_api_key:
            return False
        return os.getenv("COGNEE_PREFER_AIMLAPI", "true").lower() in {"1", "true", "yes"}

    def _configure_process_env(self) -> None:
        """Configure Cognee before import so local mode matches our app runtime."""
        runtime_root = Path(os.getenv("WEBDATAOS_RUNTIME_DIR", ".runtime")).resolve()
        cognee_root = runtime_root / "cognee"
        cognee_root.mkdir(parents=True, exist_ok=True)
        for child in ("data", "system", "cache", "logs"):
            (cognee_root / child).mkdir(parents=True, exist_ok=True)

        os.environ["DATA_ROOT_DIRECTORY"] = str(cognee_root / "data")
        os.environ["SYSTEM_ROOT_DIRECTORY"] = str(cognee_root / "system")
        os.environ["CACHE_ROOT_DIRECTORY"] = str(cognee_root / "cache")
        os.environ["COGNEE_LOGS_DIR"] = str(cognee_root / "logs")
        os.environ.setdefault("REQUIRE_AUTHENTICATION", "false")
        os.environ.setdefault("ENABLE_BACKEND_ACCESS_CONTROL", "false")
        os.environ.setdefault("TELEMETRY_DISABLED", "true")
        os.environ.setdefault("COGNEE_SKIP_CONNECTION_TEST", "true")

        if self._prefer_aimlapi:
            os.environ["LLM_PROVIDER"] = "custom"
            os.environ["LLM_MODEL"] = self._cognee_llm_model()
            os.environ["LLM_ENDPOINT"] = self.settings.aimlapi_base_url
            os.environ["LLM_API_KEY"] = self.settings.aimlapi_api_key
            os.environ["EMBEDDING_PROVIDER"] = "custom"
            os.environ["EMBEDDING_MODEL"] = self.settings.cognee_embedding_model
            os.environ["EMBEDDING_ENDPOINT"] = self.settings.aimlapi_base_url
            os.environ["EMBEDDING_API_KEY"] = self.settings.aimlapi_api_key
        elif self.settings.openai_api_key:
            os.environ["OPENAI_API_KEY"] = self.settings.openai_api_key
            os.environ["LLM_PROVIDER"] = "openai"
            os.environ["LLM_MODEL"] = self._cognee_llm_model()
            os.environ["LLM_API_KEY"] = self.settings.openai_api_key
            os.environ["EMBEDDING_PROVIDER"] = "openai"
            os.environ["EMBEDDING_MODEL"] = self.settings.cognee_embedding_model
            os.environ["EMBEDDING_API_KEY"] = self.settings.openai_api_key

    async def _ensure_init(self) -> None:
        """Initialize Cognee on first use — set LLM key and optional cloud connection."""
        if self._initialized:
            return

        self._configure_process_env()

        if self._prefer_aimlapi:
            import cognee

            cognee.config.set_llm_provider("custom")
            cognee.config.set_llm_model(self._cognee_llm_model())
            cognee.config.set_llm_endpoint(self.settings.aimlapi_base_url)
            cognee.config.set_llm_api_key(self.settings.aimlapi_api_key)
            cognee.config.set_embedding_provider("custom")
            cognee.config.set_embedding_model(self.settings.cognee_embedding_model)
            cognee.config.set_embedding_endpoint(self.settings.aimlapi_base_url)
            cognee.config.set_embedding_api_key(self.settings.aimlapi_api_key)
        elif self.settings.openai_api_key:
            import cognee

            cognee.config.set_llm_provider("openai")
            cognee.config.set_llm_model(self._cognee_llm_model())
            cognee.config.set_llm_api_key(self.settings.openai_api_key)
            cognee.config.set_embedding_provider("openai")
            cognee.config.set_embedding_model(self.settings.cognee_embedding_model)
            cognee.config.set_embedding_api_key(self.settings.openai_api_key)

        # Connect to Cognee Cloud if endpoint is configured
        if self.settings.cognee_endpoint and self.settings.cognee_api_key:
            import cognee
            await cognee.serve(
                url=self.settings.cognee_endpoint,
                api_key=self.settings.cognee_api_key,
            )
            logger.info("cognee_cloud_connected", endpoint=self.settings.cognee_endpoint)

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
            async with self._io_lock:
                await cognee.remember(content)
            logger.info("cognee_remember", entity=request.entity, workspace=request.workspace_id)
        except Exception as exc:
            logger.error("cognee_remember_failed", error=str(exc))
            raise

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
            async with self._io_lock:
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
