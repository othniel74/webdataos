from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.db.models import AgentRun, DemoSession, Topic
from apps.api.db.session import get_db
from apps.api.dependencies import get_agent_orchestrator, get_graph_service, get_intelligence_service
from packages.agents.orchestrator import ResearchAgentOrchestrator
from packages.common.config import get_settings
from packages.common.time import utc_now
from packages.enterprise.packs import get_pack
from packages.graph.neo4j_client import Neo4jGraphClient
from packages.intelligence.service import IntelligenceService
from packages.schemas.agent import ResearchRequest

router = APIRouter(prefix="/demo", tags=["Public Demo"])


DEMO_MISSIONS = {
    "vendor_risk": {
        "name": "Vendor Risk and Compliance",
        "package_id": "security",
        "entities": ["Okta", "Stripe", "Microsoft"],
        "signals": ["vendor risk", "breach exposure", "compliance signals", "regulatory change"],
    },
    "gtm": {
        "name": "Competitor and GTM Intelligence",
        "package_id": "gtm",
        "entities": ["OpenAI", "Anthropic", "Google"],
        "signals": ["competitor moves", "pricing changes", "messaging shifts", "buying signals"],
    },
    "market": {
        "name": "Market and Finance Signals",
        "package_id": "finance",
        "entities": ["Nvidia", "Microsoft", "Salesforce"],
        "signals": ["filings", "supplier signals", "market movement", "pricing changes"],
    },
}


class DemoSessionCreate(BaseModel):
    mission: Literal["vendor_risk", "gtm", "market"] = "vendor_risk"


class DemoWorkspaceUpdate(BaseModel):
    mission: Literal["vendor_risk", "gtm", "market"] = "vendor_risk"
    entities: list[str] = Field(default_factory=list, max_length=5)
    signals: list[str] = Field(default_factory=list, max_length=6)


class DemoChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1200)
    history: list[dict[str, str]] = Field(default_factory=list, max_length=10)


def _settings():
    return get_settings()


def _require_demo_enabled() -> None:
    if not _settings().public_demo_enabled:
        raise HTTPException(status_code=404, detail="Public demo is disabled")


def _workspace_id(session_id: str) -> str:
    return f"demo_{session_id.replace('-', '')[:20]}"


def _session_payload(session: DemoSession) -> dict:
    return {
        "session_id": session.id,
        "tenant_id": session.tenant_id,
        "workspace_id": session.workspace_id,
        "mission": session.mission,
        "entities": session.entities or [],
        "signals": session.watch_types or [],
        "runs_used": session.runs_used,
        "chat_turns_used": session.chat_turns_used,
        "expires_at": session.expires_at.isoformat() if session.expires_at else None,
    }


async def _load_session(
    db: AsyncSession = Depends(get_db),
    session_id: str | None = Header(default=None, alias="X-Demo-Session"),
) -> DemoSession:
    _require_demo_enabled()
    if not session_id:
        raise HTTPException(status_code=401, detail="Missing demo session")
    session = await db.get(DemoSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Demo session not found")
    if session.expires_at and session.expires_at < utc_now():
        raise HTTPException(status_code=410, detail="Demo session expired")
    return session


async def _ensure_topic(db: AsyncSession, session: DemoSession, package_id: str) -> Topic:
    existing = await db.get(Topic, session.workspace_id)
    pack = get_pack(package_id)
    if existing:
        existing.tenant_id = session.tenant_id
        existing.name = f"Demo: {DEMO_MISSIONS[session.mission]['name']}"
        existing.description = f"package_id={package_id}; public demo session"
        existing.entities = session.entities or DEMO_MISSIONS[session.mission]["entities"]
        existing.watch_types = session.watch_types or DEMO_MISSIONS[session.mission]["signals"]
        return existing
    topic = Topic(
        id=session.workspace_id,
        tenant_id=session.tenant_id,
        name=f"Demo: {DEMO_MISSIONS[session.mission]['name']}",
        description=f"package_id={package_id}; public demo session",
        entities=session.entities or pack.entities,
        watch_types=session.watch_types or pack.signals,
        refresh_frequency_minutes=1440,
    )
    db.add(topic)
    return topic


@router.get("/catalog")
async def catalog():
    _require_demo_enabled()
    return {
        "missions": [
            {"id": key, **value}
            for key, value in DEMO_MISSIONS.items()
        ],
        "limits": {
            "entities": 5,
            "signals": 6,
            "runs_per_hour": _settings().demo_rate_limit_per_hour,
            "session_ttl_hours": _settings().demo_session_ttl_hours,
        },
    }


@router.post("/sessions")
async def create_session(payload: DemoSessionCreate, db: AsyncSession = Depends(get_db)):
    _require_demo_enabled()
    settings = _settings()
    session_id = str(uuid.uuid4())
    mission = DEMO_MISSIONS[payload.mission]
    session = DemoSession(
        id=session_id,
        tenant_id=settings.demo_tenant_id,
        workspace_id=_workspace_id(session_id),
        mission=payload.mission,
        entities=mission["entities"],
        watch_types=mission["signals"],
        expires_at=utc_now() + timedelta(hours=settings.demo_session_ttl_hours),
    )
    db.add(session)
    await _ensure_topic(db, session, mission["package_id"])
    await db.commit()
    return _session_payload(session)


@router.get("/sessions/current")
async def current_session(session: DemoSession = Depends(_load_session)):
    return _session_payload(session)


@router.post("/workspaces")
async def update_workspace(
    payload: DemoWorkspaceUpdate,
    session: DemoSession = Depends(_load_session),
    db: AsyncSession = Depends(get_db),
):
    mission = DEMO_MISSIONS[payload.mission]
    session.mission = payload.mission
    session.entities = [item.strip() for item in payload.entities if item.strip()][:5] or mission["entities"]
    session.watch_types = [item.strip() for item in payload.signals if item.strip()][:6] or mission["signals"]
    session.updated_at = utc_now()
    await _ensure_topic(db, session, mission["package_id"])
    await db.commit()
    return _session_payload(session)


@router.post("/monitor/run")
async def run_demo_monitor(
    session: DemoSession = Depends(_load_session),
    db: AsyncSession = Depends(get_db),
    agent: ResearchAgentOrchestrator = Depends(get_agent_orchestrator),
):
    settings = _settings()
    if session.runs_used >= settings.demo_rate_limit_per_hour:
        raise HTTPException(status_code=429, detail="Demo run limit reached for this session")
    mission = DEMO_MISSIONS[session.mission]
    topic = await _ensure_topic(db, session, mission["package_id"])
    entities = ", ".join(topic.entities or [])
    signals = ", ".join(topic.watch_types or [])
    task = (
        f"Public demo monitoring update for {topic.name}. "
        f"Watch entities: {entities}. Signals: {signals}. "
        "Show what changed, evidence, business impact, recommended action, and receipt."
    )
    session.runs_used += 1
    session.updated_at = utc_now()
    report = await agent.run(
        db,
        ResearchRequest(
            task=task,
            workspace_id=session.workspace_id,
            topic_id=session.workspace_id,
            package_id=mission["package_id"],
            max_sources=1,
            enable_memory=True,
            enable_workflows=False,
            allow_live_refresh=True,
        ),
    )
    return report


@router.post("/analyst/chat")
async def demo_analyst_chat(
    payload: DemoChatRequest,
    session: DemoSession = Depends(_load_session),
    db: AsyncSession = Depends(get_db),
    agent: ResearchAgentOrchestrator = Depends(get_agent_orchestrator),
):
    if session.chat_turns_used >= 12:
        raise HTTPException(status_code=429, detail="Demo chat limit reached for this session")
    mission = DEMO_MISSIONS[session.mission]
    question = payload.question.strip()
    recent_turns = "\n".join(
        f"{turn.get('role', 'user')}: {turn.get('content', '')[:500]}"
        for turn in payload.history[-8:]
        if turn.get("content")
    )
    task = (
        "Answer this public demo Analyst question using only the demo workspace evidence and memory. "
        "If the answer is not supported by demo evidence, say what evidence is missing. "
        "Use the recent conversation for continuity, but do not invent facts outside saved demo evidence. "
        f"Recent conversation:\n{recent_turns or 'No earlier turns.'}\n"
        f"Question: {question}"
    )
    session.chat_turns_used += 1
    session.updated_at = utc_now()
    report = await agent.run(
        db,
        ResearchRequest(
            task=task,
            workspace_id=session.workspace_id,
            topic_id=session.workspace_id,
            package_id=mission["package_id"],
            max_sources=2,
            enable_memory=True,
            enable_workflows=False,
            allow_live_refresh=False,
        ),
    )
    return report


@router.get("/evidence")
async def demo_evidence(
    session: DemoSession = Depends(_load_session),
    service: IntelligenceService = Depends(get_intelligence_service),
    db: AsyncSession = Depends(get_db),
):
    records = await service.list_records(
        db,
        topic_id=session.workspace_id,
        tenant_id=session.tenant_id,
        include_stale=False,
    )
    return {"session": _session_payload(session), "records": records}


@router.get("/graph")
async def demo_graph(
    limit: int = Query(default=80, ge=1, le=200),
    session: DemoSession = Depends(_load_session),
    graph: Neo4jGraphClient = Depends(get_graph_service),
):
    return graph.topic_graph(session.workspace_id, limit=limit, tenant_id=session.tenant_id)


@router.get("/receipt/{run_id}")
async def demo_receipt(
    run_id: str,
    session: DemoSession = Depends(_load_session),
    db: AsyncSession = Depends(get_db),
):
    run = await db.get(AgentRun, run_id)
    if not run or run.topic_id != session.workspace_id:
        raise HTTPException(status_code=404, detail="Demo run not found")
    return run.report_json or {}


@router.get("/runs/latest")
async def latest_demo_run(
    session: DemoSession = Depends(_load_session),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentRun)
        .where(AgentRun.topic_id == session.workspace_id)
        .order_by(desc(AgentRun.created_at))
        .limit(1)
    )
    run = result.scalar_one_or_none()
    return run.report_json if run else {"session": _session_payload(session), "run": None}
