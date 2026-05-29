from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from apps.api.db.session import get_db
from apps.api.db.models import AgentRun
from apps.api.dependencies import authenticated_context

router = APIRouter(prefix="/runs", tags=["Runs"], dependencies=[Depends(authenticated_context)])


@router.get("")
async def list_runs(
    topic_id: str | None = Query(default=None),
    limit: int = Query(default=25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(AgentRun).order_by(desc(AgentRun.created_at)).limit(limit)
    if topic_id:
        stmt = stmt.where(AgentRun.topic_id == topic_id)
    result = await db.execute(stmt)
    runs = result.scalars().all()
    payload = []
    for run in runs:
        report = run.report_json or {}
        receipt = report.get("run_receipt") or {}
        counts = receipt.get("counts") or {}
        providers = receipt.get("providers") or {}
        payload.append(
            {
                "id": run.id,
                "topic_id": run.topic_id,
                "task": run.task,
                "status": run.status,
                "summary": report.get("summary"),
                "created_at": str(run.created_at),
                "input_mode": receipt.get("input_mode"),
                "counts": counts,
                "providers": providers,
            }
        )
    return payload


@router.get("/{run_id}")
async def get_run(run_id: str, db: AsyncSession = Depends(get_db)):
    run = await db.get(AgentRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"id": run.id, "topic_id": run.topic_id, "task": run.task, "status": run.status, "report": run.report_json, "created_at": str(run.created_at)}
