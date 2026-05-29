"""Partner runtime routes — Speechmatics, Memory (Cognee + self-hosted), TriggerWare."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import Response

from apps.api.db.session import get_db
from apps.api.dependencies import (
    authenticated_context,
    get_memory_provider,
    get_speechmatics_service,
    get_triggerware_service,
)
from packages.common.config import get_settings
from packages.common.logging import get_logger
from packages.memory.provider import MemoryProvider
from packages.partners.speechmatics import SpeechmaticsService
from packages.partners.triggerware import TriggerWareService
from packages.schemas.partners import (
    MemoryRecord,
    MemorySearchRequest,
    MemoryUpsertRequest,
    TextToSpeechRequest,
    TranscriptionRequest,
    TranscriptionResult,
    WorkflowEvent,
    WorkflowTriggerRequest,
)

logger = get_logger(__name__)

router = APIRouter(tags=["Partner Runtime"], dependencies=[Depends(authenticated_context)])


@router.post("/transcriptions", response_model=TranscriptionResult)
async def transcribe(payload: TranscriptionRequest, speechmatics: SpeechmaticsService = Depends(get_speechmatics_service)) -> TranscriptionResult:
    return await speechmatics.transcribe(payload)


@router.post("/transcriptions/upload", response_model=TranscriptionResult)
async def transcribe_upload(
    audio: UploadFile = File(...),
    language: str = Form("en"),
    speechmatics: SpeechmaticsService = Depends(get_speechmatics_service),
) -> TranscriptionResult:
    content = await audio.read()
    return await speechmatics.transcribe_audio_file(
        content,
        filename=audio.filename or "recording.webm",
        content_type=audio.content_type,
        language=language,
    )


@router.post("/speech/synthesize")
async def synthesize_speech(
    payload: TextToSpeechRequest,
    speechmatics: SpeechmaticsService = Depends(get_speechmatics_service),
) -> Response:
    audio = await speechmatics.synthesize(payload)
    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"Content-Disposition": 'inline; filename="speechmatics.wav"'},
    )


@router.post("/memory/upsert", response_model=MemoryRecord)
async def memory_upsert(
    payload: MemoryUpsertRequest,
    memory: MemoryProvider = Depends(get_memory_provider),
    db: AsyncSession = Depends(get_db),
) -> MemoryRecord:
    """Store memory in Cognee (knowledge graph) + self-hosted (vector store)."""
    return await memory.upsert(db, payload)


@router.post("/memory/search", response_model=list[MemoryRecord])
async def memory_search(
    payload: MemorySearchRequest,
    memory: MemoryProvider = Depends(get_memory_provider),
    db: AsyncSession = Depends(get_db),
) -> list[MemoryRecord]:
    """Search Cognee graph + self-hosted embeddings, merged and ranked."""
    return await memory.search(db, payload)


@router.post("/workflows/trigger", response_model=WorkflowEvent)
async def trigger_workflow(payload: WorkflowTriggerRequest, triggerware: TriggerWareService = Depends(get_triggerware_service)) -> WorkflowEvent:
    return await triggerware.trigger(payload)


# ── Slack integration ─────────────────────────────────────────────────

class SlackConfigPayload(BaseModel):
    webhook_url: str
    notify_on: str = "high"  # "high" | "medium" | "any"


@router.get("/integrations/slack")
async def slack_status() -> dict:
    """Return whether Slack is currently configured."""
    settings = get_settings()
    return {
        "configured": bool(settings.slack_webhook_url),
        "notify_on_change": settings.slack_notify_on_change,
        "webhook_url_preview": (settings.slack_webhook_url or "")[:40] + "…" if settings.slack_webhook_url else None,
    }


@router.post("/integrations/slack/test")
async def slack_test(payload: SlackConfigPayload | None = None) -> dict:
    """Send a test notification to the configured (or provided) Slack webhook."""
    settings = get_settings()
    webhook_url = (payload.webhook_url if payload else None) or settings.slack_webhook_url
    if not webhook_url:
        raise HTTPException(status_code=400, detail="No Slack webhook URL configured. Provide one in the request or set SLACK_WEBHOOK_URL in environment.")

    test_blocks = [
        {"type": "header", "text": {"type": "plain_text", "text": "✅  WebDataOS — Slack connected", "emoji": True}},
        {"type": "section", "text": {"type": "mrkdwn", "text": "Your Slack integration is working. Intelligence briefs will be delivered here when signals change."}},
        {"type": "context", "elements": [{"type": "mrkdwn", "text": "WebDataOS Intelligence OS · test notification"}]},
    ]
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(webhook_url, json={"blocks": test_blocks})
            r.raise_for_status()
        logger.info("slack_test_sent", webhook_preview=webhook_url[:40])
        return {"ok": True, "message": "Test notification sent to Slack."}
    except Exception as exc:
        logger.warning("slack_test_failed", error=str(exc))
        raise HTTPException(status_code=502, detail=f"Slack delivery failed: {exc}")
