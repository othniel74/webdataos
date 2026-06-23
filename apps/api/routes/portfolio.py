"""Portfolio intelligence — aggregate signals across multiple workspaces."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.db.models import AgentRun, IntelligenceRecord, Topic
from apps.api.db.session import get_db
from apps.api.dependencies import authenticated_context
from packages.common.security import AuthContext

router = APIRouter(prefix="/portfolio", tags=["Portfolio Intelligence"])


@router.get("/brief")
async def portfolio_brief(
    workspace_ids: str = Query(..., description="Comma-separated workspace IDs"),
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(authenticated_context),
) -> dict[str, Any]:
    """Return a combined intelligence brief across multiple workspaces.

    Aggregates the latest signals, changes, and risk postures from each
    workspace into a single portfolio-level view.
    """
    ids = [w.strip() for w in workspace_ids.split(",") if w.strip()]

    workspaces: list[dict] = []
    all_signals: list[dict] = []
    high_risk: list[str] = []
    elevated: list[str] = []

    for ws_id in ids:
        # Resolve workspace (tenant-scoped)
        topic = await db.get(Topic, ws_id)
        if not topic or (topic.tenant_id != auth.tenant_id and auth.tenant_id not in {"tenant_internal", "demo"}):
            # Try scoped ID
            scoped = f"{auth.tenant_id}_workspace_{ws_id}"
            topic = await db.get(Topic, scoped)
        if not topic:
            continue

        # Latest run for this workspace
        run_result = await db.execute(
            select(AgentRun)
            .where(AgentRun.topic_id == topic.id)
            .order_by(AgentRun.created_at.desc())
            .limit(1)
        )
        latest_run = run_result.scalar_one_or_none()

        brief = None
        risk_posture = "stable"
        delta_headline = None
        recommended_action = None
        severity = "low"

        if latest_run and latest_run.report_json:
            rj = latest_run.report_json
            db_brief = rj.get("decision_brief") or {}
            brief = db_brief.get("headline")
            delta_headline = db_brief.get("delta_headline")
            recommended_action = db_brief.get("recommended_action")
            severity = db_brief.get("severity", "low")
            risk_posture = rj.get("reasoning", {}).get("risk_posture", "stable") if rj.get("reasoning") else "stable"

        # Recent evidence records
        rec_result = await db.execute(
            select(IntelligenceRecord)
            .where(IntelligenceRecord.topic_id == topic.id)
            .order_by(IntelligenceRecord.extracted_at.desc())
            .limit(5)
        )
        records = rec_result.scalars().all()
        signals = [
            {
                "entity": r.entity_name,
                "summary": (r.summary or "")[:120],
                "source_tier": r.source_tier or 3,
                "freshness": r.freshness_status,
                "workspace": topic.name,
            }
            for r in records if r.entity_name
        ]
        all_signals.extend(signals)

        if risk_posture in {"elevated", "critical"} or severity in {"high", "critical"}:
            high_risk.append(topic.name)
        elif delta_headline:
            elevated.append(topic.name)

        workspaces.append({
            "id": topic.id,
            "name": topic.name,
            "risk_posture": risk_posture,
            "severity": severity,
            "headline": brief,
            "delta_headline": delta_headline,
            "recommended_action": recommended_action,
            "signal_count": len(signals),
            "last_run": latest_run.created_at.isoformat() if latest_run else None,
        })

    # Sort: high risk first
    workspaces.sort(key=lambda w: (
        0 if w["risk_posture"] in {"critical", "elevated"} else
        1 if w["delta_headline"] else 2
    ))

    t1_count = sum(1 for s in all_signals if s.get("source_tier") == 1)

    return {
        "workspace_count": len(workspaces),
        "high_risk_workspaces": high_risk,
        "changed_workspaces": elevated,
        "total_signals": len(all_signals),
        "t1_source_signals": t1_count,
        "workspaces": workspaces,
        "top_signals": sorted(all_signals, key=lambda s: s.get("source_tier", 3))[:15],
    }
