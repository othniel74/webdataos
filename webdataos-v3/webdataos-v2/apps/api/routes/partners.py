"""Partner runtime routes — Speechmatics, Memory (Cognee + self-hosted), TriggerWare."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.db.session import get_db
from apps.api.dependencies import authenticated_context, get_memory_provider, get_speechmatics_service, get_triggerware_service
from packages.memory.provider import MemoryProvider
from packages.partners.speechmatics import SpeechmaticsService
from packages.partners.triggerware import TriggerWareService
from packages.schemas.partners import (
    MemoryRecord,
    MemorySearchRequest,
    MemoryUpsertRequest,
    TranscriptionRequest,
    TranscriptionResult,
    WorkflowEvent,
    WorkflowTriggerRequest,
)

router = APIRouter(tags=["Partner Runtime"], dependencies=[Depends(authenticated_context)])


@router.post("/transcriptions", response_model=TranscriptionResult)
async def transcribe(payload: TranscriptionRequest, speechmatics: SpeechmaticsService = Depends(get_speechmatics_service)) -> TranscriptionResult:
    return await speechmatics.transcribe(payload)


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
