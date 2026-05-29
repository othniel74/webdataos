from __future__ import annotations

import httpx
import pytest

from packages.llm.client import LLMClient, LLMProvider


class _FakeClient:
    def __init__(self, provider_name: str, calls: list[str]) -> None:
        self.provider_name = provider_name
        self.calls = calls
        self.is_closed = False

    async def post(self, path: str, json: dict) -> httpx.Response:
        self.calls.append(self.provider_name)
        request = httpx.Request("POST", f"https://example.test{path}")
        if self.provider_name == "openai":
            return httpx.Response(500, request=request, text="temporary provider failure")
        return httpx.Response(
            200,
            request=request,
            json={"choices": [{"message": {"content": '{"ok": true}'}}]},
        )


@pytest.mark.asyncio
async def test_llm_client_falls_back_to_aimlapi_when_openai_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    client = LLMClient()
    client.providers = [
        LLMProvider("openai", "openai-key", "https://api.openai.com/v1", "gpt-4o-mini"),
        LLMProvider("aimlapi", "aimlapi-key", "https://api.aimlapi.com/v1", "gpt-4o"),
    ]
    client.provider = "openai+aimlapi"

    async def fake_get_client(provider: LLMProvider) -> _FakeClient:
        return _FakeClient(provider.name, calls)

    monkeypatch.setattr(client, "_get_client", fake_get_client)

    result = await client.chat_json("system", "user")

    assert result == {"ok": True}
    assert calls == ["openai", "aimlapi"]
    assert client.last_provider == "aimlapi"
