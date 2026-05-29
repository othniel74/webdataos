from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.db.models import Topic
from apps.api.db.session import get_db
from apps.api.dependencies import authenticated_context, get_graph_service, get_intelligence_service
from packages.common.security import AuthContext
from packages.graph.neo4j_client import Neo4jGraphClient
from packages.intelligence.service import IntelligenceService
from packages.schemas.intelligence import GraphBackfillResult, GraphSnapshot, GraphStatus

router = APIRouter(prefix="/graph", tags=["Enterprise Graph"])


@router.get("/status", response_model=GraphStatus)
async def graph_status(
    graph: Neo4jGraphClient = Depends(get_graph_service),
    auth: AuthContext = Depends(authenticated_context),
) -> GraphStatus:
    return graph.status(tenant_id=auth.tenant_id)


@router.get("/topics/{topic_id}", response_model=GraphSnapshot)
async def topic_graph(
    topic_id: str,
    limit: int = Query(default=80, ge=1, le=250),
    db: AsyncSession = Depends(get_db),
    graph: Neo4jGraphClient = Depends(get_graph_service),
    auth: AuthContext = Depends(authenticated_context),
) -> GraphSnapshot:
    topic = await db.get(Topic, topic_id)
    if not topic or topic.tenant_id != auth.tenant_id:
        raise HTTPException(status_code=404, detail="Workspace graph not found")
    return graph.topic_graph(topic_id, limit=limit, tenant_id=auth.tenant_id)


@router.post("/topics/{topic_id}/backfill", response_model=GraphBackfillResult)
async def backfill_topic_graph(
    topic_id: str,
    include_stale: bool = Query(default=False),
    freshness_required_days: int = Query(default=7, ge=1, le=365),
    limit: int = Query(default=500, ge=1, le=2000),
    db: AsyncSession = Depends(get_db),
    service: IntelligenceService = Depends(get_intelligence_service),
    auth: AuthContext = Depends(authenticated_context),
) -> GraphBackfillResult:
    topic = await db.get(Topic, topic_id)
    if not topic or topic.tenant_id != auth.tenant_id:
        raise HTTPException(status_code=404, detail="Workspace graph not found")
    return await service.backfill_graph(
        db,
        topic_id=topic_id,
        include_stale=include_stale,
        freshness_required_days=freshness_required_days,
        tenant_id=auth.tenant_id,
        limit=limit,
    )


@router.get("/entities/{entity}", response_model=GraphSnapshot)
async def entity_graph(
    entity: str,
    limit: int = Query(default=60, ge=1, le=200),
    graph: Neo4jGraphClient = Depends(get_graph_service),
    auth: AuthContext = Depends(authenticated_context),
) -> GraphSnapshot:
    return graph.entity_neighborhood(entity, limit=limit, tenant_id=auth.tenant_id)
