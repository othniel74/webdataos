"""Thin async OpenAI-compatible LLM client using httpx.

Falls back gracefully when no API key is configured.
Supports OpenAI first, then AI/ML API as an OpenAI-compatible fallback.
"""
from __future__ import annotations

import json
from typing import Any

import httpx

from packages.common.config import get_settings
from packages.common.logging import get_logger

logger = get_logger(__name__)

MAX_TOKENS = 4096
TEMPERATURE = 0.3


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
        if api_key:
            self.api_key = api_key
            self.base_url = base_url or "https://api.openai.com/v1"
            self.model = model or settings.openai_model
            self.provider = provider or "custom"
        elif settings.openai_api_key:
            self.api_key = settings.openai_api_key
            self.base_url = base_url or "https://api.openai.com/v1"
            self.model = model or settings.openai_model
            self.provider = provider or "openai"
        elif settings.aimlapi_api_key:
            self.api_key = settings.aimlapi_api_key
            self.base_url = base_url or settings.aimlapi_base_url
            self.model = model or settings.aimlapi_model
            self.provider = provider or "aimlapi"
        else:
            self.api_key = None
            self.base_url = base_url or "https://api.openai.com/v1"
            self.model = model or settings.openai_model
            self.provider = provider
        self._client: httpx.AsyncClient | None = None

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=60.0,
            )
        return self._client

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

        client = await self._get_client()

        payload: dict[str, Any] = {
            "model": self.model,
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
            return data["choices"][0]["message"]["content"]
        except httpx.HTTPStatusError as exc:
            logger.error("llm_api_error", status=exc.response.status_code, body=exc.response.text[:500])
            raise
        except Exception as exc:
            logger.error("llm_request_failed", error=str(exc))
            raise

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
        if self._client and not self._client.is_closed:
            await self._client.aclose()
