from fastapi import APIRouter, Depends, HTTPException
from apps.api.db.models import Topic
from sqlalchemy.ext.asyncio import AsyncSession
from apps.api.db.session import get_db
from apps.api.dependencies import authenticated_context, get_agent_orchestrator
from packages.common.identifiers import normalize_workspace_id
from packages.common.security import AuthContext
from packages.agents.orchestrator import ResearchAgentOrchestrator
from packages.enterprise.packs import get_pack
from packages.schemas.agent import ResearchReport, ResearchRequest

router = APIRouter(prefix="/agent", tags=["Track 1 - Agent"], dependencies=[Depends(authenticated_context)])


@router.post("/research", response_model=ResearchReport)
async def research(
    req: ResearchRequest,
    db: AsyncSession = Depends(get_db),
    agent: ResearchAgentOrchestrator = Depends(get_agent_orchestrator),
    auth: AuthContext = Depends(authenticated_context),
):
    topic_id = normalize_workspace_id(req.workspace_id or req.topic_id)
    req.workspace_id = topic_id
    req.topic_id = topic_id
    topic = await db.get(Topic, topic_id)
    if topic and topic.tenant_id != auth.tenant_id:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if not topic:
        pack = get_pack(req.package_id)
        topic = Topic(
            id=topic_id,
            tenant_id=auth.tenant_id,
            name=topic_id.replace("_", " ").title(),
            description=f"package_id={pack.id}; {pack.description}",
            entities=[],
            watch_types=[],
            refresh_frequency_minutes=1440,
        )
        db.add(topic)
        await db.commit()
    return await agent.run(db, req)
