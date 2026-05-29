from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import HTTPException

from packages.brightdata.client import BrightDataClient
from packages.common.config import get_settings
from packages.common.security import require_api_key


@pytest.mark.asyncio
async def test_serp_search_encodes_long_agent_prompt(monkeypatch):
    monkeypatch.setenv("MOCK_BRIGHTDATA", "false")
    monkeypatch.setenv("BRIGHTDATA_API_KEY", "bd-test")
    get_settings.cache_clear()
    captured = {}

    async def fake_post_json(self, endpoint, payload, circuit_name):
        captured["payload"] = payload
        return {
            "organic": [
                {
                    "title": "Result",
                    "url": "https://example.com/result",
                    "snippet": "ok",
                }
            ]
        }

    monkeypatch.setattr(BrightDataClient, "_post_json", fake_post_json)
    prompt = (
        "Answer this public demo Analyst question using only the demo workspace evidence and\n"
        "include quotes, commas, ampersands & unsafe uri characters"
    )

    results = await BrightDataClient().serp_search(prompt, country="us")

    assert results[0].url == "https://example.com/result"
    search_url = captured["payload"]["url"]
    parsed = urlparse(search_url)
    assert parsed.scheme == "https"
    assert parsed.netloc == "www.google.com"
    params = parse_qs(parsed.query)
    assert params["q"] == [prompt]
    assert params["gl"] == ["us"]
    assert "\n" not in search_url
    assert " " not in search_url
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_mixed_auth_accepts_verified_clerk_session(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "mixed")
    monkeypatch.setenv("API_AUTH_ENABLED", "false")
    get_settings.cache_clear()

    def fake_verify(token, settings):
        assert token == "session-token"
        return {"sub": "user_123", "org_id": "org_abc", "org_role": "admin"}

    monkeypatch.setattr("packages.common.security.verify_clerk_token", fake_verify)

    auth = await require_api_key(
        request=None,
        authorization="Bearer session-token",
        x_api_key=None,
    )

    assert auth.auth_type == "clerk"
    assert auth.tenant_id == "clerk_org_org_abc"
    assert auth.user_id == "user_123"
    assert auth.org_id == "org_abc"
    assert auth.role == "admin"
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_mixed_auth_rejects_anonymous_protected_route(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "mixed")
    monkeypatch.setenv("API_AUTH_ENABLED", "false")
    monkeypatch.setenv("API_KEYS", "")
    get_settings.cache_clear()

    with pytest.raises(HTTPException) as exc:
        await require_api_key(request=None, authorization=None, x_api_key=None)

    assert exc.value.status_code == 401
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_mixed_auth_allows_configured_api_key(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "mixed")
    monkeypatch.setenv("API_AUTH_ENABLED", "false")
    monkeypatch.setenv("API_KEYS", "sdk-key")
    get_settings.cache_clear()

    auth = await require_api_key(request=None, authorization=None, x_api_key="sdk-key")

    assert auth.auth_type == "api_key"
    assert auth.principal == "api-key"
    get_settings.cache_clear()

