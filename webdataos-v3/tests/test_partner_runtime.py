import pytest
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
async def test_cognee_memory_upsert_and_search():
    service = CogneeMemoryService()
    record = await service.upsert(MemoryUpsertRequest(workspace_id="ws", entity="Okta", content="Okta vendor risk context"))
    results = await service.search(MemorySearchRequest(workspace_id="ws", query="Okta", entities=["Okta"]))
    assert record.memory_id in {item.memory_id for item in results}
    assert results[0].provider == "cognee"


@pytest.mark.asyncio
async def test_triggerware_workflow_trigger():
    service = TriggerWareService()
    event = await service.trigger(WorkflowTriggerRequest(workspace_id="ws", event_type="vendor_risk", severity="high", summary="Critical vendor risk signal"))
    assert event.provider == "triggerware"
    assert event.status == "triggered"
    assert "review" in event.action
