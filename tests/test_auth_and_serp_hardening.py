from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import HTTPException

from apps.api.db.models import DemoSession, IntelligenceRecord, Source, Topic
from apps.api.routes.demo import _demo_records_graph, run_demo_monitor
from packages.brightdata.client import BrightDataClient
from packages.common.clerk import _domain_from_publishable_key, _jwks_url
from packages.common.config import get_settings
from packages.common.identifiers import normalize_workspace_id
from packages.common.security import require_api_key
from packages.schemas.intelligence import IntelligenceRecordRead


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
async def test_mixed_auth_does_not_use_clerk_azp_as_tenant(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "mixed")
    monkeypatch.setenv("API_AUTH_ENABLED", "false")
    get_settings.cache_clear()

    def fake_verify(token, settings):
        return {
            "sub": "user_123",
            "azp": "http://45.77.89.209",
        }

    monkeypatch.setattr("packages.common.security.verify_clerk_token", fake_verify)

    auth = await require_api_key(
        request=None,
        authorization="Bearer session-token",
        x_api_key=None,
    )

    assert auth.auth_type == "clerk"
    assert auth.org_id is None
    assert auth.tenant_id == "clerk_user_user_123"
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_mixed_auth_sanitizes_clerk_org_tenant(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "mixed")
    monkeypatch.setenv("API_AUTH_ENABLED", "false")
    get_settings.cache_clear()

    def fake_verify(token, settings):
        return {"sub": "user_123", "org_id": "org:abc/demo"}

    monkeypatch.setattr("packages.common.security.verify_clerk_token", fake_verify)

    auth = await require_api_key(
        request=None,
        authorization="Bearer session-token",
        x_api_key=None,
    )

    assert auth.tenant_id == "clerk_org_org_abc_demo"
    get_settings.cache_clear()


def test_normalize_workspace_id_repairs_legacy_clerk_azp_workspace_id():
    assert (
        normalize_workspace_id("clerk_org_http://45.77.89.209_workspace_enterprise")
        == "workspace_enterprise"
    )


def test_normalize_workspace_id_keeps_normal_workspace_ids():
    assert normalize_workspace_id("workspace_enterprise") == "workspace_enterprise"
    assert normalize_workspace_id("customer_vendor_risk") == "customer_vendor_risk"
    assert (
        normalize_workspace_id("clerk_user_user_123_workspace_enterprise")
        == "clerk_user_user_123_workspace_enterprise"
    )


def test_clerk_jwks_url_can_be_derived_from_publishable_key(monkeypatch):
    monkeypatch.setenv("CLERK_PUBLISHABLE_KEY", "pk_test_cmVhbC1mZWxpbmUtMjAuY2xlcmsuYWNjb3VudHMuZGV2JA")
    monkeypatch.delenv("CLERK_JWKS_URL", raising=False)
    monkeypatch.delenv("CLERK_ISSUER", raising=False)
    get_settings.cache_clear()

    settings = get_settings()

    assert _domain_from_publishable_key(settings.clerk_publishable_key) == "real-feline-20.clerk.accounts.dev"
    assert _jwks_url(settings) == "https://real-feline-20.clerk.accounts.dev/.well-known/jwks.json"
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


class _FakeDemoDb:
    def __init__(self, topic: Topic) -> None:
        self.objects = {(Topic, topic.id): topic}

    async def get(self, cls, object_id):
        return self.objects.get((cls, object_id))

    def add(self, obj) -> None:
        self.objects[(obj.__class__, obj.id)] = obj

    async def flush(self) -> None:
        return None


class _FakeDemoAgent:
    def __init__(self) -> None:
        self.request = None

    async def run(self, db, request):
        self.request = request
        return {"run_id": "demo_run"}


@pytest.mark.asyncio
async def test_demo_monitor_uses_fast_bounded_baseline_path():
    session = DemoSession(
        id="demo-session",
        tenant_id="tenant_demo",
        workspace_id="demo_workspace",
        mission="vendor_risk",
        entities=["Okta", "Stripe", "Microsoft"],
        watch_types=["vendor risk", "compliance signals"],
        runs_used=0,
    )
    topic = Topic(
        id=session.workspace_id,
        tenant_id=session.tenant_id,
        name="Demo: Vendor Risk and Compliance",
        entities=session.entities,
        watch_types=session.watch_types,
    )
    db = _FakeDemoDb(topic)
    agent = _FakeDemoAgent()

    result = await run_demo_monitor(session=session, db=db, agent=agent)

    assert result == {"run_id": "demo_run"}
    assert session.runs_used == 1
    assert agent.request.enable_llm is False
    assert agent.request.enable_memory is False
    assert agent.request.enable_workflows is False
    assert agent.request.allow_live_refresh is False
    assert agent.request.max_sources == 3
    assert sum(1 for cls, _ in db.objects if cls is Source) == 3
    assert sum(1 for cls, _ in db.objects if cls is IntelligenceRecord) == 3


def test_demo_graph_falls_back_to_saved_records():
    session = DemoSession(
        id="demo-session",
        tenant_id="tenant_demo",
        workspace_id="demo_workspace",
        mission="vendor_risk",
        entities=["Okta"],
        watch_types=["vendor risk"],
    )
    record = IntelligenceRecordRead(
        id="record_1",
        tenant_id="tenant_demo",
        topic_id="demo_workspace",
        entity_name="Okta",
        entity_type="company",
        source_url="https://trust.okta.com/",
        source_type="company_page",
        facts={"evidence_title": "Okta Trust", "features": ["vendor risk", "compliance"]},
        summary="Okta trust evidence.",
        confidence=0.74,
        freshness_status="fresh",
    )

    graph = _demo_records_graph(session, [record])

    assert graph.status == "ok"
    assert graph.counts["nodes"] == 6
    assert graph.counts["relationships"] == 7
    assert any(node.type == "Company" and node.label == "Okta" for node in graph.nodes)
    assert any(rel.type == "SUPPORTED_BY" for rel in graph.relationships)
