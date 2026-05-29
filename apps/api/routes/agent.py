from fastapi import APIRouter, Depends, HTTPException
from apps.api.db.models import Topic
from sqlalchemy.ext.asyncio import AsyncSession
from apps.api.db.session import get_db
from apps.api.dependencies import authenticated_context, get_agent_orchestrator
from packages.common.security import AuthContext
from packages.agents.orchestrator import ResearchAgentOrchestrator
from packages.schemas.agent import ResearchReport, ResearchRequest

router = APIRouter(prefix="/agent", tags=["Track 1 - Agent"], dependencies=[Depends(authenticated_context)])


@router.post("/research", response_model=ResearchReport)
async def research(
    req: ResearchRequest,
    db: AsyncSession = Depends(get_db),
    agent: ResearchAgentOrchestrator = Depends(get_agent_orchestrator),
    auth: AuthContext = Depends(authenticated_context),
):
    topic = await db.get(Topic, req.workspace_id)
    if topic and topic.tenant_id != auth.tenant_id:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return await agent.run(db, req)
