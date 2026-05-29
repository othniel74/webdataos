from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from apps.api.db.session import get_db
from apps.api.db.models import AgentRun
from apps.api.dependencies import authenticated_context

router = APIRouter(prefix="/runs", tags=["Runs"], dependencies=[Depends(authenticated_context)])


@router.get("")
async def list_runs(limit: int = 25, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AgentRun).order_by(desc(AgentRun.created_at)).limit(limit))
    runs = result.scalars().all()
    return [
        {"id": run.id, "topic_id": run.topic_id, "task": run.task, "status": run.status, "created_at": str(run.created_at)}
        for run in runs
    ]


@router.get("/{run_id}")
async def get_run(run_id: str, db: AsyncSession = Depends(get_db)):
    run = await db.get(AgentRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"id": run.id, "topic_id": run.topic_id, "task": run.task, "status": run.status, "report": run.report_json, "created_at": str(run.created_at)}
