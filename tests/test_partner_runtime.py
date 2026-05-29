import pytest
from packages.common.config import get_settings
from packages.partners.speechmatics import SpeechmaticsService
from packages.partners.cognee import CogneeMemoryService
from packages.partners.triggerware import TriggerWareService
from packages.schemas.partners import MemorySearchRequest, MemoryUpsertRequest, TranscriptionRequest, WorkflowTriggerRequest


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
