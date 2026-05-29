"""Thin async OpenAI client using httpx.

Falls back gracefully when no API key is configured.
Supports gpt-4o, gpt-4o-mini, or any OpenAI-compatible endpoint.
"""
from __future__ import annotations

import json
from typing import Any

import httpx

from packages.common.config import get_settings
from packages.common.logging import get_logger

logger = get_logger(__name__)

OPENAI_BASE = "https://api.openai.com/v1"
DEFAULT_MODEL = "gpt-4o-mini"
MAX_TOKENS = 4096
TEMPERATURE = 0.3


class LLMClient:
    """Async OpenAI chat completions client.

    When no API key is set, ``available`` returns False and callers
    should fall back to rule-based logic.
    """

    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        settings = get_settings()
        self.api_key = api_key or settings.openai_api_key
        self.model = model or DEFAULT_MODEL
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
