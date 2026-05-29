"""OpenAI-compatible embeddings client with provider fallback."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import httpx

from packages.common.config import get_settings
from packages.common.logging import get_logger

logger = get_logger(__name__)

OPENAI_BASE = "https://api.openai.com/v1"
MODEL = "text-embedding-3-small"
DIMENSIONS = 1536


@dataclass(frozen=True)
class EmbeddingProvider:
    name: str
    api_key: str
    base_url: str
    model: str = MODEL


class EmbeddingClient:
    def __init__(self, api_key: str | None = None) -> None:
        settings = get_settings()
        self.providers: list[EmbeddingProvider] = []
        if api_key:
            self.providers.append(EmbeddingProvider("custom", api_key, OPENAI_BASE))
        else:
            if settings.openai_api_key:
                self.providers.append(EmbeddingProvider("openai", settings.openai_api_key, OPENAI_BASE))
            if settings.aimlapi_api_key:
                self.providers.append(EmbeddingProvider("aimlapi", settings.aimlapi_api_key, settings.aimlapi_base_url))
        self._clients: dict[str, httpx.AsyncClient] = {}
        self._disabled: set[str] = set()

    @property
    def available(self) -> bool:
        return any(provider.name not in self._disabled for provider in self.providers)

    async def _get_client(self, provider: EmbeddingProvider) -> httpx.AsyncClient:
        client = self._clients.get(provider.name)
        if client is None or client.is_closed:
            client = httpx.AsyncClient(
                base_url=provider.base_url,
                headers={
                    "Authorization": f"Bearer {provider.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=30.0,
            )
            self._clients[provider.name] = client
        return client

    async def embed(self, text: str) -> list[float]:
        if not self.available:
            raise RuntimeError("Embedding client has no API key")
        data = await self._post_embeddings(text)
        return data["data"][0]["embedding"]

    async def embed_batch(self, texts: Sequence[str]) -> list[list[float]]:
        if not self.available:
            raise RuntimeError("Embedding client has no API key")
        if not texts:
            return []
        data = await self._post_embeddings(list(texts))
        sorted_data = sorted(data["data"], key=lambda x: x["index"])
        return [item["embedding"] for item in sorted_data]

    async def _post_embeddings(self, input_value: str | list[str]) -> dict:
        last_error: Exception | None = None
        for provider in self.providers:
            if provider.name in self._disabled:
                continue
            client = await self._get_client(provider)
            try:
                response = await client.post(
                    "/embeddings",
                    json={
                        "model": provider.model,
                        "input": input_value,
                        "dimensions": DIMENSIONS,
                    },
                )
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as exc:
                last_error = exc
                if exc.response.status_code in {401, 403}:
                    self._disabled.add(provider.name)
                logger.warning("embedding_provider_failed", provider=provider.name, status=exc.response.status_code)
            except Exception as exc:
                last_error = exc
                logger.warning("embedding_provider_failed", provider=provider.name, error=str(exc))
        if last_error:
            raise last_error
        raise RuntimeError("Embedding client has no active providers")

    async def close(self) -> None:
        for client in self._clients.values():
            if not client.is_closed:
                await client.aclose()
