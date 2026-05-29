"""Thin async OpenAI-compatible LLM client using httpx.

Falls back gracefully when no API key is configured.
Supports OpenAI and AI/ML API as mutual OpenAI-compatible fallbacks.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any

import httpx

from packages.common.config import get_settings
from packages.common.logging import get_logger

logger = get_logger(__name__)

MAX_TOKENS = 4096
TEMPERATURE = 0.3


@dataclass(frozen=True)
class LLMProvider:
    name: str
    api_key: str
    base_url: str
    model: str


class LLMClient:
    """Async OpenAI-compatible chat completions client.

    When no LLM API key is set, ``available`` returns False and callers
    should fall back to rule-based logic.
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
        provider: str | None = None,
    ) -> None:
        settings = get_settings()
        self.providers: list[LLMProvider] = []
        if api_key:
            self.providers.append(
                LLMProvider(
                    name=provider or "custom",
                    api_key=api_key,
                    base_url=base_url or "https://api.openai.com/v1",
                    model=model or settings.openai_model,
                )
            )
        else:
            if settings.openai_api_key:
                self.providers.append(
                    LLMProvider(
                        name="openai",
                        api_key=settings.openai_api_key,
                        base_url=base_url or "https://api.openai.com/v1",
                        model=model or settings.openai_model,
                    )
                )
            if settings.aimlapi_api_key:
                self.providers.append(
                    LLMProvider(
                        name="aimlapi",
                        api_key=settings.aimlapi_api_key,
                        base_url=settings.aimlapi_base_url,
                        model=settings.aimlapi_model,
                    )
                )
        self.provider = "+".join(p.name for p in self.providers) or provider
        self.last_provider: str | None = None
        self._clients: dict[str, httpx.AsyncClient] = {}
        self._disabled: set[str] = set()

    @property
    def available(self) -> bool:
        return any(provider.name not in self._disabled for provider in self.providers)

    async def _get_client(self, provider: LLMProvider) -> httpx.AsyncClient:
        client = self._clients.get(provider.name)
        if client is None or client.is_closed:
            client = httpx.AsyncClient(
                base_url=provider.base_url,
                headers={
                    "Authorization": f"Bearer {provider.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=60.0,
            )
            self._clients[provider.name] = client
        return client

    async def chat(
        self,
        system: str,
        user: str,
        temperature: float = TEMPERATURE,
        max_tokens: int = MAX_TOKENS,
        json_mode: bool = False,
    ) -> str:
        """Send a chat completion request. Returns the assistant message text."""
        if not self.available:
            raise RuntimeError("LLM client has no API key configured")

        last_error: Exception | None = None
        for provider in self.providers:
            if provider.name in self._disabled:
                continue
            client = await self._get_client(provider)
            payload: dict[str, Any] = {
                "model": provider.model,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            }

            if json_mode:
                payload["response_format"] = {"type": "json_object"}

            try:
                response = await client.post("/chat/completions", json=payload)
                response.raise_for_status()
                data = response.json()
                self.last_provider = provider.name
                return data["choices"][0]["message"]["content"]
            except httpx.HTTPStatusError as exc:
                last_error = exc
                if exc.response.status_code in {401, 403}:
                    self._disabled.add(provider.name)
                logger.warning(
                    "llm_provider_failed",
                    provider=provider.name,
                    status=exc.response.status_code,
                    body=exc.response.text[:500],
                )
            except Exception as exc:
                last_error = exc
                logger.warning("llm_provider_failed", provider=provider.name, error=str(exc))

        if last_error is not None:
            raise last_error
        raise RuntimeError("LLM client has no providers configured")

    async def chat_json(
        self,
        system: str,
        user: str,
        temperature: float = TEMPERATURE,
        max_tokens: int = MAX_TOKENS,
    ) -> dict:
        """Chat completion that returns parsed JSON."""
        text = await self.chat(system, user, temperature, max_tokens, json_mode=True)
        # Strip markdown fences if present
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[-1]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
        return json.loads(cleaned)

    async def close(self) -> None:
        for client in self._clients.values():
            if not client.is_closed:
                await client.aclose()
