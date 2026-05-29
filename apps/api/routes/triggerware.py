from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.db.models import AgentRun, AutonomousAction
from apps.api.db.session import get_db
from apps.api.dependencies import authenticated_context
from packages.common.identifiers import normalize_workspace_id

router = APIRouter(prefix="/triggerware", tags=["TriggerWare"], dependencies=[Depends(authenticated_context)])


@router.get("/events")
async def list_triggerware_events(
    workspace_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Material WebDataOS events for TriggerWare custom connectors.

    TriggerWare custom connectors are pull-based virtual tables. This endpoint
    exposes durable WebDataOS action rows so TriggerWare can query them on a
    schedule and create downstream workflows from the deltas.
    """
    stmt = select(AutonomousAction).order_by(desc(AutonomousAction.created_at)).limit(limit)
    if workspace_id:
        workspace_id = normalize_workspace_id(workspace_id)
        stmt = stmt.where(AutonomousAction.workspace_id == workspace_id)
    if status:
        stmt = stmt.where(AutonomousAction.status == status)

    result = await db.execute(stmt)
    actions = result.scalars().all()
    run_ids = [a.run_id for a in actions if a.run_id]
    runs_by_id: dict[str, AgentRun] = {}
    if run_ids:
        run_result = await db.execute(select(AgentRun).where(AgentRun.id.in_(run_ids)))
        runs_by_id = {r.id: r for r in run_result.scalars().all()}

    return [_event_from_action(action, runs_by_id.get(action.run_id or "")) for action in actions]


def _event_from_action(action: AutonomousAction, run: AgentRun | None) -> dict:
    payload = action.payload or {}
    report = (run.report_json or {}) if run else {}
    package_id = report.get("package_id") or payload.get("package_id") or "enterprise"
    reasoning = report.get("reasoning") or {}
    recommendations = reasoning.get("recommendations") or []
    first_rec = recommendations[0] if recommendations else {}
    evidence_urls = report.get("sources") or payload.get("evidence_urls") or []
    entity_name = _entity_name(payload, first_rec, report)
    signal_type = first_rec.get("framework_used") or action.action_type
    severity = first_rec.get("materiality") or payload.get("severity") or _severity_from_status(action.status)

    return {
        "event_id": action.id,
        "workspace_id": action.workspace_id,
        "run_id": action.run_id or "",
        "domain": package_id,
        "package_id": package_id,
        "event_type": "recommended_action",
        "signal_type": signal_type,
        "severity": severity,
        "entity_id": entity_name,
        "entity_name": entity_name,
        "summary": action.description or action.title,
        "recommended_action": action.title,
        "workflow_action": action.action_type,
        "action_status": action.status,
        "source_system": "webdataos",
        "evidence_urls": evidence_urls,
        "created_at": str(action.created_at) if action.created_at else "",
        "updated_at": str(action.executed_at) if action.executed_at else "",
        "payload": {
            "action": {
                "id": action.id,
                "type": action.action_type,
                "status": action.status,
                "approved_by": action.approved_by,
            },
            "recommendation": first_rec,
            "run_summary": report.get("summary") if report else None,
        },
    }


def _entity_name(payload: dict, recommendation: dict, report: dict) -> str:
    entities = payload.get("entities") or recommendation.get("affected_entities") or []
    if isinstance(entities, list) and entities:
        return str(entities[0])
    companies = report.get("companies") or []
    if isinstance(companies, list) and companies:
        company = companies[0]
        if isinstance(company, dict):
            return str(company.get("name") or company.get("entity_name") or "")
        return str(company)
    return ""


def _severity_from_status(status: str) -> str:
    if status == "pending_approval":
        return "high"
    if status in {"approved", "auto_approved"}:
        return "medium"
    return "low"
