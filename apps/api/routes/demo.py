from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.db.models import AgentRun, DemoSession, IntelligenceRecord, Source, Topic
from apps.api.db.session import get_db
from apps.api.dependencies import get_agent_orchestrator, get_graph_service, get_intelligence_service
from packages.agents.orchestrator import ResearchAgentOrchestrator
from packages.common.config import get_settings
from packages.common.time import utc_now
from packages.enterprise.packs import get_pack
from packages.graph.neo4j_client import Neo4jGraphClient
from packages.intelligence.service import IntelligenceService
from packages.intelligence.utils import infer_authority, infer_source_type, stable_id
from packages.schemas.agent import ResearchRequest
from packages.schemas.intelligence import GraphNode, GraphRelationship, GraphSnapshot, IntelligenceRecordRead

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

DEMO_BASELINE_SOURCES = {
    "vendor_risk": [
        {
            "entity": "Okta",
            "url": "https://trust.okta.com/",
            "title": "Okta Trust",
            "summary": "Okta publishes trust, security, privacy, compliance, and service-status material that vendor-risk teams can monitor for assurance changes.",
            "signal_type": "vendor_risk",
        },
        {
            "entity": "Stripe",
            "url": "https://stripe.com/docs/security",
            "title": "Stripe Security",
            "summary": "Stripe documents platform security controls and operating practices that procurement and compliance teams can use during vendor review.",
            "signal_type": "compliance",
        },
        {
            "entity": "Microsoft",
            "url": "https://www.microsoft.com/trust-center",
            "title": "Microsoft Trust Center",
            "summary": "Microsoft's Trust Center centralizes security, privacy, compliance, and transparency information relevant to enterprise risk reviews.",
            "signal_type": "vendor_risk",
        },
    ],
    "gtm": [
        {
            "entity": "OpenAI",
            "url": "https://openai.com/business/",
            "title": "OpenAI for Business",
            "summary": "OpenAI positions enterprise AI around productivity, workflow automation, and secure deployment across business teams.",
            "signal_type": "competitor_move",
        },
        {
            "entity": "Anthropic",
            "url": "https://www.anthropic.com/enterprise",
            "title": "Anthropic Enterprise",
            "summary": "Anthropic's enterprise messaging emphasizes safe AI, business workflows, and Claude deployment for organizations.",
            "signal_type": "messaging_shift",
        },
        {
            "entity": "Google",
            "url": "https://cloud.google.com/vertex-ai",
            "title": "Google Vertex AI",
            "summary": "Google Cloud positions Vertex AI as a platform for building, deploying, and governing enterprise AI applications.",
            "signal_type": "competitor_move",
        },
    ],
    "market": [
        {
            "entity": "Nvidia",
            "url": "https://investor.nvidia.com/financial-info/sec-filings/default.aspx",
            "title": "NVIDIA SEC filings",
            "summary": "NVIDIA investor filings provide public financial and market-risk disclosures useful for supplier and market monitoring.",
            "signal_type": "filing",
        },
        {
            "entity": "Microsoft",
            "url": "https://www.microsoft.com/en-us/investor/earnings",
            "title": "Microsoft Investor Relations",
            "summary": "Microsoft investor materials provide public earnings, segment, and risk disclosures for market intelligence workflows.",
            "signal_type": "market_movement",
        },
        {
            "entity": "Salesforce",
            "url": "https://investor.salesforce.com/financials/sec-filings/default.aspx",
            "title": "Salesforce SEC filings",
            "summary": "Salesforce filings expose public business, market, and operational signals relevant to enterprise finance monitoring.",
            "signal_type": "filing",
        },
    ],
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


async def _ensure_demo_baseline_records(db: AsyncSession, session: DemoSession, topic: Topic) -> int:
    """Create a fast baseline so public demo runs do not depend on paid live APIs."""
    selected_entities = {entity.lower() for entity in (topic.entities or []) if entity}
    selected_signals = topic.watch_types or DEMO_MISSIONS[session.mission]["signals"]
    created = 0
    now = utc_now()
    sources = DEMO_BASELINE_SOURCES[session.mission]
    for item in sources:
        if selected_entities and item["entity"].lower() not in selected_entities:
            continue
        source_id = stable_id(topic.id, item["url"])
        source = await db.get(Source, source_id)
        if not source:
            source = Source(
                id=source_id,
                tenant_id=session.tenant_id,
                topic_id=topic.id,
                url=item["url"],
                title=item["title"],
                snippet=item["summary"],
                source_type=infer_source_type(item["url"]),
                authority=infer_authority(item["url"]),
                status="active",
                last_checked=now,
            )
            db.add(source)
        record_id = stable_id(topic.id, item["url"], item["entity"], "demo_baseline")
        record = await db.get(IntelligenceRecord, record_id)
        facts = {
            "company": item["entity"],
            "evidence_title": item["title"],
            "signal_type": item["signal_type"],
            "watch_signals": selected_signals,
            "positioning": item["summary"],
            "features": selected_signals[:3],
            "target_customers": ["enterprise teams"],
            "demo_baseline": True,
        }
        if record:
            record.tenant_id = session.tenant_id
            record.topic_id = topic.id
            record.source_id = source_id
            record.entity_name = item["entity"]
            record.source_url = item["url"]
            record.source_type = infer_source_type(item["url"])
            record.facts_json = facts
            record.summary = item["summary"]
            record.confidence = 0.74
            record.freshness_status = "fresh"
            record.last_checked = now
            record.extracted_at = now
            continue
        db.add(
            IntelligenceRecord(
                id=record_id,
                tenant_id=session.tenant_id,
                topic_id=topic.id,
                source_id=source_id,
                entity_name=item["entity"],
                entity_type="company",
                source_url=item["url"],
                source_type=infer_source_type(item["url"]),
                facts_json=facts,
                summary=item["summary"],
                confidence=0.74,
                freshness_status="fresh",
                embedding_text=f"{item['entity']} {item['summary']} {' '.join(selected_signals)}",
                last_checked=now,
                extracted_at=now,
            )
        )
        created += 1
    await db.flush()
    return created


def _demo_records_graph(session: DemoSession, records: list[IntelligenceRecordRead]) -> GraphSnapshot:
    nodes: dict[str, GraphNode] = {}
    relationships: dict[tuple[str, str, str], GraphRelationship] = {}

    workspace_id = f"Workspace:{session.workspace_id}"
    nodes[workspace_id] = GraphNode(
        id=workspace_id,
        label=DEMO_MISSIONS[session.mission]["name"],
        type="Workspace",
        properties={"id": session.workspace_id, "tenant_id": session.tenant_id, "source": "demo_evidence"},
    )
    for record in records:
        entity = record.entity_name or record.facts.get("company") or "Unknown"
        company_id = f"Company:{entity}"
        record_id = f"IntelligenceRecord:{record.id}"
        source_id = f"Source:{record.source_url}"
        nodes[company_id] = GraphNode(
            id=company_id,
            label=entity,
            type="Company",
            properties={"tenant_id": session.tenant_id, "entity_type": record.entity_type or "company"},
        )
        nodes[record_id] = GraphNode(
            id=record_id,
            label=record.facts.get("evidence_title") or record.summary or record.id,
            type="IntelligenceRecord",
            properties={
                "id": record.id,
                "summary": record.summary,
                "confidence": record.confidence,
                "freshness_status": record.freshness_status,
            },
        )
        nodes[source_id] = GraphNode(
            id=source_id,
            label=record.source_url,
            type="Source",
            properties={"url": record.source_url, "source_type": record.source_type},
        )
        for source, target, rel_type in [
            (workspace_id, company_id, "MONITORS"),
            (workspace_id, record_id, "HAS_EVIDENCE"),
            (company_id, record_id, "HAS_RECORD"),
            (record_id, source_id, "SUPPORTED_BY"),
            (company_id, source_id, "SUPPORTED_BY"),
        ]:
            relationships[(source, target, rel_type)] = GraphRelationship(
                source=source,
                target=target,
                type=rel_type,
                properties={"source": "demo_evidence"},
            )
        for feature in record.facts.get("features", []) or []:
            feature_id = f"Feature:{feature}"
            nodes[feature_id] = GraphNode(
                id=feature_id,
                label=str(feature),
                type="Feature",
                properties={"tenant_id": session.tenant_id},
            )
            relationships[(company_id, feature_id, "HAS_FEATURE")] = GraphRelationship(
                source=company_id,
                target=feature_id,
                type="HAS_FEATURE",
                properties={"source": "demo_evidence"},
            )
    return GraphSnapshot(
        status="ok",
        nodes=list(nodes.values()),
        relationships=list(relationships.values()),
        counts={"nodes": len(nodes), "relationships": len(relationships)},
        message="Derived from saved demo evidence because the graph projection had no nodes yet.",
    )


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
    await _ensure_demo_baseline_records(db, session, topic)
    report = await agent.run(
        db,
        ResearchRequest(
            task=task,
            workspace_id=session.workspace_id,
            topic_id=session.workspace_id,
            package_id=mission["package_id"],
            freshness_required_days=30,
            max_sources=3,
            enable_memory=False,
            enable_workflows=False,
            enable_llm=False,
            allow_live_refresh=False,
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
            enable_memory=False,
            enable_workflows=False,
            enable_llm=False,
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
    service: IntelligenceService = Depends(get_intelligence_service),
    graph: Neo4jGraphClient = Depends(get_graph_service),
    db: AsyncSession = Depends(get_db),
):
    snapshot = graph.topic_graph(session.workspace_id, limit=limit, tenant_id=session.tenant_id)
    if snapshot.nodes:
        return snapshot
    records = await service.list_records(
        db,
        topic_id=session.workspace_id,
        tenant_id=session.tenant_id,
        include_stale=False,
    )
    return _demo_records_graph(session, records[:limit])


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
