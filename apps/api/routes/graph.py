from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.db.session import get_db
from apps.api.dependencies import authenticated_context, get_graph_service, get_intelligence_service
from packages.graph.neo4j_client import Neo4jGraphClient
from packages.intelligence.service import IntelligenceService
from packages.schemas.intelligence import GraphBackfillResult, GraphSnapshot, GraphStatus

router = APIRouter(prefix="/graph", tags=["Enterprise Graph"], dependencies=[Depends(authenticated_context)])


@router.get("/status", response_model=GraphStatus)
async def graph_status(graph: Neo4jGraphClient = Depends(get_graph_service)) -> GraphStatus:
    return graph.status()


@router.get("/topics/{topic_id}", response_model=GraphSnapshot)
async def topic_graph(
    topic_id: str,
    limit: int = Query(default=80, ge=1, le=250),
    graph: Neo4jGraphClient = Depends(get_graph_service),
) -> GraphSnapshot:
    return graph.topic_graph(topic_id, limit=limit)


@router.post("/topics/{topic_id}/backfill", response_model=GraphBackfillResult)
async def backfill_topic_graph(
    topic_id: str,
    include_stale: bool = Query(default=False),
    freshness_required_days: int = Query(default=7, ge=1, le=365),
    limit: int = Query(default=500, ge=1, le=2000),
    db: AsyncSession = Depends(get_db),
    service: IntelligenceService = Depends(get_intelligence_service),
) -> GraphBackfillResult:
    return await service.backfill_graph(
        db,
        topic_id=topic_id,
        include_stale=include_stale,
        freshness_required_days=freshness_required_days,
        limit=limit,
    )


@router.get("/entities/{entity}", response_model=GraphSnapshot)
async def entity_graph(
    entity: str,
    limit: int = Query(default=60, ge=1, le=200),
    graph: Neo4jGraphClient = Depends(get_graph_service),
) -> GraphSnapshot:
    return graph.entity_neighborhood(entity, limit=limit)
