from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.db.models import AgentRun, AutonomousAction, ChangeEvent, IntelligenceRecord, Outcome, RefreshRun, Topic
from apps.api.db.session import get_db
from apps.api.dependencies import authenticated_context, get_agent_orchestrator
from packages.common.identifiers import normalize_workspace_id
from packages.common.security import AuthContext
from packages.enterprise.packs import get_pack, package_id_from_description
from packages.agents.orchestrator import ResearchAgentOrchestrator
from packages.schemas.agent import ResearchRequest

router = APIRouter(prefix="/monitor", tags=["Monitor"], dependencies=[Depends(authenticated_context)])


def _iso(value) -> str | None:
    return value.isoformat() if value else None


def _to_utc(value) -> datetime | None:
    if not value:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _run_summary(run: AgentRun) -> dict:
    report = run.report_json or {}
    receipt = report.get("run_receipt") or {}
    reasoning = report.get("reasoning") or {}
    return {
        "id": run.id,
        "task": run.task,
        "status": run.status,
        "created_at": _iso(run.created_at),
        "summary": report.get("summary"),
        "decision_brief": report.get("decision_brief"),
        "risk_posture": reasoning.get("risk_posture"),
        "value_loop": receipt.get("value_loop") or [],
        "recommendations": reasoning.get("recommendations") or [],
        "counts": receipt.get("counts") or {},
        "providers": receipt.get("providers") or {},
    }


@router.get("/{workspace_id}")
async def monitor_summary(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(authenticated_context),
):
    workspace_id = normalize_workspace_id(workspace_id)
    topic = await db.get(Topic, workspace_id)
    if not topic or topic.tenant_id != auth.tenant_id:
        raise HTTPException(status_code=404, detail="Workspace not found")

    runs_result = await db.execute(
        select(AgentRun)
        .where(AgentRun.topic_id == workspace_id, AgentRun.tenant_id == auth.tenant_id)
        .order_by(desc(AgentRun.created_at))
        .limit(10)
    )
    runs = runs_result.scalars().all()

    records_result = await db.execute(
        select(IntelligenceRecord)
        .where(IntelligenceRecord.topic_id == workspace_id, IntelligenceRecord.tenant_id == auth.tenant_id)
        .order_by(desc(IntelligenceRecord.extracted_at))
        .limit(12)
    )
    records = records_result.scalars().all()

    actions_result = await db.execute(
        select(AutonomousAction)
        .where(AutonomousAction.workspace_id == workspace_id, AutonomousAction.tenant_id == auth.tenant_id)
        .order_by(desc(AutonomousAction.created_at))
        .limit(12)
    )
    actions = actions_result.scalars().all()

    changes_result = await db.execute(
        select(ChangeEvent)
        .where(ChangeEvent.topic_id == workspace_id, ChangeEvent.tenant_id == auth.tenant_id)
        .order_by(desc(ChangeEvent.detected_at))
        .limit(12)
    )
    changes = changes_result.scalars().all()

    refresh_result = await db.execute(
        select(RefreshRun)
        .where(RefreshRun.topic_id == workspace_id, RefreshRun.tenant_id == auth.tenant_id)
        .order_by(desc(RefreshRun.started_at))
        .limit(5)
    )
    refresh_runs = refresh_result.scalars().all()

    outcomes_result = await db.execute(
        select(Outcome)
        .where(Outcome.workspace_id == workspace_id, Outcome.tenant_id == auth.tenant_id)
        .order_by(desc(Outcome.created_at))
        .limit(12)
    )
    outcomes = outcomes_result.scalars().all()

    now = datetime.now(UTC)
    day_ago = now - timedelta(days=1)
    new_records_24h = sum(1 for record in records if (_to_utc(record.extracted_at) or now) >= day_ago)
    pending_actions = sum(1 for action in actions if action.status in {"pending_approval", "auto_approved", "approved"})
    last_run_at = _to_utc(runs[0].created_at) if runs else None
    next_due_at = last_run_at + timedelta(minutes=topic.refresh_frequency_minutes) if last_run_at else now
    due = next_due_at <= now

    return {
        "workspace": {
            "id": topic.id,
            "name": topic.name,
            "package_id": package_id_from_description(topic.description),
            "entities": topic.entities or [],
            "watch_types": topic.watch_types or [],
            "refresh_frequency_minutes": topic.refresh_frequency_minutes,
        },
        "status": {
            "cadence_minutes": topic.refresh_frequency_minutes,
            "last_run_at": _iso(last_run_at),
            "next_due_at": _iso(next_due_at),
            "due": due,
        },
        "counts": {
            "runs": len(runs),
            "records": len(records),
            "new_records_24h": new_records_24h,
            "changes": len(changes),
            "pending_actions": pending_actions,
            "outcomes": len(outcomes),
        },
        "latest_run": _run_summary(runs[0]) if runs else None,
        "runs": [_run_summary(run) for run in runs],
        "records": [
            {
                "id": record.id,
                "entity_name": record.entity_name,
                "summary": record.summary,
                "source_url": record.source_url,
                "source_type": record.source_type,
                "confidence": record.confidence,
                "freshness_status": record.freshness_status,
                "facts": record.facts_json or {},
                "extracted_at": _iso(record.extracted_at),
                "last_checked": _iso(record.last_checked),
            }
            for record in records
        ],
        "actions": [
            {
                "id": action.id,
                "title": action.title,
                "description": action.description,
                "status": action.status,
                "action_type": action.action_type,
                "run_id": action.run_id,
                "created_at": _iso(action.created_at),
            }
            for action in actions
        ],
        "changes": [
            {
                "id": change.id,
                "record_id": change.record_id,
                "change_type": change.change_type,
                "field": change.field,
                "detected_at": _iso(change.detected_at),
            }
            for change in changes
        ],
        "outcomes": [
            {
                "id": outcome.id,
                "run_id": outcome.run_id,
                "action_id": outcome.action_id,
                "entity_name": outcome.entity_name,
                "signal_type": outcome.signal_type,
                "outcome_type": outcome.outcome_type,
                "created_at": _iso(outcome.created_at),
            }
            for outcome in outcomes
        ],
        "refresh_runs": [
            {
                "id": run.id,
                "status": run.status,
                "sources_checked": run.sources_checked,
                "records_created": run.records_created,
                "started_at": _iso(run.started_at),
                "completed_at": _iso(run.completed_at),
                "error": run.error,
            }
            for run in refresh_runs
        ],
    }


@router.post("/{workspace_id}/run")
async def run_monitoring(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(authenticated_context),
    agent: ResearchAgentOrchestrator = Depends(get_agent_orchestrator),
):
    workspace_id = normalize_workspace_id(workspace_id)
    topic = await db.get(Topic, workspace_id)
    if not topic or topic.tenant_id != auth.tenant_id:
        raise HTTPException(status_code=404, detail="Workspace not found")

    entities = ", ".join(topic.entities or []) or topic.name
    signals = ", ".join(topic.watch_types or []) or "material external changes"
    package_id = package_id_from_description(topic.description)
    pack = get_pack(package_id)
    task = (
        f"Run the {pack.name} monitoring update for {topic.name}. "
        f"Watch entities: {entities}. "
        f"Signals: {signals}. "
        f"Use the {pack.name} framework. "
        "Return what changed, why it matters, evidence, recommended actions, and a concise executive update."
    )
    return await agent.run(
        db,
        ResearchRequest(
            task=task,
            topic_id=workspace_id,
            workspace_id=workspace_id,
            package_id=package_id,
            input_mode="text",
            max_sources=8,
            enable_memory=True,
            enable_workflows=True,
        ),
    )
