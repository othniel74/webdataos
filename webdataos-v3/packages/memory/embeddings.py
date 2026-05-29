"""Thin async OpenAI embeddings client.

Uses text-embedding-3-small (1536 dimensions, $0.02/1M tokens).
Falls back gracefully when no API key is set — callers use keyword
matching instead of semantic search.
"""
from __future__ import annotations

import logging
from typing import Sequence

import httpx

from packages.common.config import get_settings

logger = logging.getLogger(__name__)

OPENAI_BASE = "https://api.openai.com/v1"
MODEL = "text-embedding-3-small"
DIMENSIONS = 1536


class EmbeddingClient:

    def __init__(self, api_key: str | None = None) -> None:
        settings = get_settings()
        self.api_key = api_key or settings.openai_api_key
        self._client: httpx.AsyncClient | None = None

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=OPENAI_BASE,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=30.0,
            )
        return self._client

    async def embed(self, text: str) -> list[float]:
        """Embed a single text string. Returns a vector of floats."""
        if not self.available:
            raise RuntimeError("Embedding client has no API key")
        client = await self._get_client()
        try:
            response = await client.post("/embeddings", json={
                "model": MODEL,
                "input": text,
                "dimensions": DIMENSIONS,
            })
            response.raise_for_status()
            data = response.json()
            return data["data"][0]["embedding"]
        except Exception as exc:
            logger.error("embedding_failed", error=str(exc))
            raise

    async def embed_batch(self, texts: Sequence[str]) -> list[list[float]]:
        """Embed multiple texts in a single API call."""
        if not self.available:
            raise RuntimeError("Embedding client has no API key")
        if not texts:
            return []
        client = await self._get_client()
        try:
            response = await client.post("/embeddings", json={
                "model": MODEL,
                "input": list(texts),
                "dimensions": DIMENSIONS,
            })
            response.raise_for_status()
            data = response.json()
            # Sort by index to maintain order
            sorted_data = sorted(data["data"], key=lambda x: x["index"])
            return [item["embedding"] for item in sorted_data]
        except Exception as exc:
            logger.error("batch_embedding_failed", error=str(exc))
            raise

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
