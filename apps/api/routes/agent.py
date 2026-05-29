from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from apps.api.db.session import get_db
from apps.api.dependencies import authenticated_context, get_agent_orchestrator
from apps.api.workspace_resolution import ensure_workspace
from packages.common.identifiers import normalize_workspace_id
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
    topic = await ensure_workspace(
        db,
        normalize_workspace_id(req.workspace_id or req.topic_id),
        auth,
        package_id=req.package_id,
    )
    req.workspace_id = topic.id
    req.topic_id = topic.id
    return await agent.run(db, req)
