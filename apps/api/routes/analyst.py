"""API routes for organizational context, autonomous actions, and outcome tracking."""
from __future__ import annotations

import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.db.models import AutonomousAction, OrganizationalContext
from apps.api.db.session import get_db
from apps.api.dependencies import authenticated_context
from packages.common.time import utc_now
from packages.outcomes.service import OutcomeService
from packages.schemas.reasoning import (
    ActionApproval,
    ActionRead,
    OrgContextCreate,
    OrgContextRead,
    OutcomeRead,
    OutcomeRecord,
    OutcomeStats,
)

router = APIRouter(tags=["Autonomous Analyst"], dependencies=[Depends(authenticated_context)])

_outcome_svc = OutcomeService()


# ── Organizational Context ───────────────────────────────────────────

@router.post("/context", response_model=OrgContextRead)
async def upsert_context(payload: OrgContextCreate, db: AsyncSession = Depends(get_db)) -> OrgContextRead:
    result = await db.execute(
        select(OrganizationalContext).where(OrganizationalContext.workspace_id == payload.workspace_id)
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.contracts = [c.model_dump() if hasattr(c, "model_dump") else c for c in payload.contracts]
        existing.risk_thresholds = payload.risk_thresholds.model_dump() if hasattr(payload.risk_thresholds, "model_dump") else payload.risk_thresholds
        existing.financial_exposure = payload.financial_exposure.model_dump() if hasattr(payload.financial_exposure, "model_dump") else payload.financial_exposure
        existing.renewal_calendar = payload.renewal_calendar
        existing.strategic_priorities = payload.strategic_priorities
        existing.compliance_requirements = payload.compliance_requirements
        await db.commit()
        return _ctx_read(existing)
    ctx = OrganizationalContext(
        id=str(uuid.uuid4()),
        workspace_id=payload.workspace_id,
        contracts=[c.model_dump() if hasattr(c, "model_dump") else c for c in payload.contracts],
        risk_thresholds=payload.risk_thresholds.model_dump() if hasattr(payload.risk_thresholds, "model_dump") else payload.risk_thresholds,
        financial_exposure=payload.financial_exposure.model_dump() if hasattr(payload.financial_exposure, "model_dump") else payload.financial_exposure,
        renewal_calendar=payload.renewal_calendar,
        strategic_priorities=payload.strategic_priorities,
        compliance_requirements=payload.compliance_requirements,
    )
    db.add(ctx)
    await db.commit()
    return _ctx_read(ctx)


@router.get("/context/{workspace_id}", response_model=OrgContextRead)
async def get_context(workspace_id: str, db: AsyncSession = Depends(get_db)) -> OrgContextRead:
    result = await db.execute(
        select(OrganizationalContext).where(OrganizationalContext.workspace_id == workspace_id)
    )
    ctx = result.scalar_one_or_none()
    if not ctx:
        raise HTTPException(status_code=404, detail="No organizational context for this workspace")
    return _ctx_read(ctx)


# ── Autonomous Actions ───────────────────────────────────────────────

@router.get("/actions/{workspace_id}", response_model=list[ActionRead])
async def list_actions(workspace_id: str, status: str | None = None, db: AsyncSession = Depends(get_db)):
    stmt = select(AutonomousAction).where(AutonomousAction.workspace_id == workspace_id)
    if status:
        stmt = stmt.where(AutonomousAction.status == status)
    stmt = stmt.order_by(AutonomousAction.created_at.desc()).limit(50)
    result = await db.execute(stmt)
    return [_action_read(a) for a in result.scalars().all()]


@router.post("/actions/{action_id}/approve", response_model=ActionRead)
async def approve_action(action_id: str, approval: ActionApproval, db: AsyncSession = Depends(get_db)):
    action = await db.get(AutonomousAction, action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    if action.status not in {"pending_approval", "auto_approved"}:
        raise HTTPException(status_code=400, detail=f"Cannot approve action in status: {action.status}")
    if approval.approve:
        action.status = "approved"
        action.approved_by = approval.approved_by
    else:
        action.status = "rejected"
        action.approved_by = approval.approved_by
    await db.commit()
    return _action_read(action)


@router.post("/actions/{action_id}/execute", response_model=ActionRead)
async def execute_action(action_id: str, db: AsyncSession = Depends(get_db)):
    action = await db.get(AutonomousAction, action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    if action.status not in {"approved", "auto_approved"}:
        raise HTTPException(status_code=400, detail=f"Cannot execute action in status: {action.status}")
    # In production, this would actually execute the action (send email, update register, etc.)
    action.status = "executed"
    action.executed_at = utc_now()
    await db.commit()
    return _action_read(action)


# ── Outcomes ─────────────────────────────────────────────────────────

@router.post("/outcomes", response_model=OutcomeRead)
async def record_outcome(payload: OutcomeRecord, db: AsyncSession = Depends(get_db)):
    return await _outcome_svc.record(db, payload)


@router.get("/outcomes/{workspace_id}", response_model=list[OutcomeRead])
async def list_outcomes(workspace_id: str, db: AsyncSession = Depends(get_db)):
    return await _outcome_svc.list_outcomes(db, workspace_id)


@router.get("/outcomes/{workspace_id}/stats", response_model=OutcomeStats)
async def outcome_stats(workspace_id: str, db: AsyncSession = Depends(get_db)):
    return await _outcome_svc.get_stats(db, workspace_id)


# ── Helpers ──────────────────────────────────────────────────────────

def _ctx_read(ctx: OrganizationalContext) -> OrgContextRead:
    return OrgContextRead(
        id=ctx.id,
        workspace_id=ctx.workspace_id,
        contracts=ctx.contracts or [],
        risk_thresholds=ctx.risk_thresholds or {},
        financial_exposure=ctx.financial_exposure or {},
        renewal_calendar=ctx.renewal_calendar or [],
        strategic_priorities=ctx.strategic_priorities or [],
        compliance_requirements=ctx.compliance_requirements or [],
        created_at=str(ctx.created_at) if ctx.created_at else None,
        updated_at=str(ctx.updated_at) if ctx.updated_at else None,
    )


def _action_read(a: AutonomousAction) -> ActionRead:
    return ActionRead(
        id=a.id,
        workspace_id=a.workspace_id,
        run_id=a.run_id,
        recommendation_id=a.recommendation_id,
        action_type=a.action_type,
        status=a.status,
        title=a.title,
        description=a.description,
        payload=a.payload or {},
        approved_by=a.approved_by,
        executed_at=str(a.executed_at) if a.executed_at else None,
        created_at=str(a.created_at) if a.created_at else None,
    )
