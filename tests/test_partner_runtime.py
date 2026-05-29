import pytest
from packages.common.config import get_settings
from packages.memory.provider import MemoryProvider
from packages.partners.speechmatics import SpeechmaticsService
from packages.partners.cognee import CogneeMemoryService
from packages.partners.triggerware import TriggerWareService
from packages.schemas.partners import MemoryRecord, MemorySearchRequest, MemoryUpsertRequest, TranscriptionRequest, WorkflowTriggerRequest


@pytest.mark.asyncio
async def test_speechmatics_mock_transcription():
    service = SpeechmaticsService()
    result = await service.transcribe(TranscriptionRequest(mock_text="Check vendor risk and trigger a workflow."))
    assert result.provider == "speechmatics"
    assert "vendor risk" in result.text
    assert result.transcript_id.startswith("tr_")


@pytest.mark.asyncio
async def test_cognee_memory_requires_runtime_configuration(monkeypatch):
    for key in ("OPENAI_API_KEY", "AIMLAPI_API_KEY", "LLM_API_KEY", "COGNEE_ENDPOINT", "COGNEE_API_KEY"):
        monkeypatch.setenv(key, "")
    get_settings.cache_clear()

    service = CogneeMemoryService()
    record = await service.upsert(MemoryUpsertRequest(workspace_id="ws", entity="Okta", content="Okta vendor risk context"))
    results = await service.search(MemorySearchRequest(workspace_id="ws", query="Okta", entities=["Okta"]))
    assert service.available is False
    assert record.memory_id.startswith("cog_mock_")
    assert results == []
    get_settings.cache_clear()


class SlowCognee:
    def __init__(self):
        self._available = True
        self.settings = type("Settings", (), {"cognee_timeout_seconds": 0.01})()

    @property
    def available(self):
        return self._available

    def disable(self, reason: str):
        self._available = False

    async def upsert(self, request):
        import asyncio
        await asyncio.sleep(1)

    async def search(self, request):
        import asyncio
        await asyncio.sleep(1)
        return []


class FakeSelfHostedMemory:
    async def upsert(self, db, request):
        return MemoryRecord(
            memory_id="self_hosted_1",
            provider="webdataos_memory",
            workspace_id=request.workspace_id,
            entity=request.entity,
            content=request.content,
            evidence_urls=request.evidence_urls,
        )

    async def search(self, db, request):
        return [
            MemoryRecord(
                memory_id="self_hosted_1",
                provider="webdataos_memory",
                workspace_id=request.workspace_id,
                entity=request.entities[0] if request.entities else "entity",
                content="Self-hosted fallback memory",
                evidence_urls=[],
                score=0.8,
            )
        ]

    async def clear_workspace(self, db, workspace_id):
        return 1


@pytest.mark.asyncio
async def test_memory_provider_falls_back_when_cognee_times_out():
    provider = MemoryProvider(cognee=SlowCognee(), self_hosted=FakeSelfHostedMemory())

    record = await provider.upsert(
        None,
        MemoryUpsertRequest(workspace_id="ws", entity="Okta", content="Vendor risk context"),
    )
    results = await provider.search(
        None,
        MemorySearchRequest(workspace_id="ws", query="vendor risk", entities=["Okta"]),
    )

    assert provider.cognee.available is False
    assert record.provider == "webdataos_memory"
    assert results[0].provider == "webdataos_memory"


@pytest.mark.asyncio
async def test_triggerware_workflow_trigger():
    service = TriggerWareService()
    event = await service.trigger(WorkflowTriggerRequest(workspace_id="ws", event_type="vendor_risk", severity="high", summary="Critical vendor risk signal"))
    assert event.provider == "triggerware"
    assert event.status == "triggered"
    assert "review" in event.action


@pytest.mark.asyncio
async def test_triggerware_remote_payload_and_signature(monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return {
                "event_id": "evt_remote",
                "status": "accepted",
                "action": "create_vendor_review_task",
                "action_id": "act_remote",
            }

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, headers, content):
            captured["url"] = url
            captured["headers"] = headers
            captured["content"] = content
            return FakeResponse()

    monkeypatch.setenv("TRIGGERWARE_ENDPOINT", "https://triggerware.example/webdataos")
    monkeypatch.setenv("TRIGGERWARE_API_KEY", "tw-key")
    monkeypatch.setenv("TRIGGERWARE_WEBHOOK_SECRET", "secret")
    get_settings.cache_clear()
    monkeypatch.setattr("packages.partners.triggerware.httpx.AsyncClient", FakeClient)

    service = TriggerWareService()
    event = await service.trigger(
        WorkflowTriggerRequest(
            event_id="run_1:workflow",
            workspace_id="ws",
            run_id="run_1",
            domain="security",
            package_id="security",
            event_type="material_intelligence_signal",
            signal_type="vendor_risk",
            entity_name="Okta",
            severity="high",
            summary="Vendor risk changed",
            recommended_action="Request updated SOC2",
            evidence_urls=["https://example.com/trust"],
        )
    )

    assert event.status == "accepted"
    assert event.action_id == "act_remote"
    assert captured["url"] == "https://triggerware.example/webdataos"
    assert captured["headers"]["Authorization"] == "Bearer tw-key"
    assert captured["headers"]["X-WebDataOS-Signature"].startswith("sha256=")
    assert b'"domain":"security"' in captured["content"]
    assert b'"recommended_action":"Request updated SOC2"' in captured["content"]
    get_settings.cache_clear()
