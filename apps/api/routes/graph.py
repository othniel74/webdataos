from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.db.session import get_db
from apps.api.dependencies import authenticated_context, get_graph_service, get_intelligence_service
from apps.api.workspace_resolution import resolve_workspace
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
    limit: int = Query(default=120, ge=1, le=400),
    db: AsyncSession = Depends(get_db),
    graph: Neo4jGraphClient = Depends(get_graph_service),
    auth: AuthContext = Depends(authenticated_context),
) -> GraphSnapshot:
    topic = await resolve_workspace(db, topic_id, auth)
    if not topic:
        raise HTTPException(status_code=404, detail="Workspace graph not found")
    return graph.topic_graph(topic.id, limit=limit, tenant_id=auth.tenant_id)


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
    topic = await resolve_workspace(db, topic_id, auth)
    if not topic:
        raise HTTPException(status_code=404, detail="Workspace graph not found")
    return await service.backfill_graph(
        db,
        topic_id=topic.id,
        include_stale=include_stale,
        freshness_required_days=freshness_required_days,
        tenant_id=auth.tenant_id,
        limit=limit,
    )


@router.get("/entities/{entity}", response_model=GraphSnapshot)
async def entity_graph(
    entity: str,
    limit: int = Query(default=80, ge=1, le=300),
    graph: Neo4jGraphClient = Depends(get_graph_service),
    auth: AuthContext = Depends(authenticated_context),
) -> GraphSnapshot:
    return graph.entity_neighborhood(entity, limit=limit, tenant_id=auth.tenant_id)


@router.get("/signals", response_model=GraphSnapshot)
async def signal_graph(
    signal_type: str | None = Query(default=None, description="Filter by signal type: breach, compliance, competitor_move, pricing, filing, supplier_risk, market_movement, informational"),
    limit: int = Query(default=80, ge=1, le=300),
    graph: Neo4jGraphClient = Depends(get_graph_service),
    auth: AuthContext = Depends(authenticated_context),
) -> GraphSnapshot:
    """Graph of signals, affected entities, and linked risks across all workspaces."""
    return graph.signal_graph(signal_type=signal_type, tenant_id=auth.tenant_id, limit=limit)


@router.get("/cross-entity", response_model=GraphSnapshot)
async def cross_entity_graph(
    min_co_occurrences: int = Query(default=1, ge=1, le=50, description="Minimum number of times two entities co-occur in runs"),
    limit: int = Query(default=100, ge=1, le=400),
    graph: Neo4jGraphClient = Depends(get_graph_service),
    auth: AuthContext = Depends(authenticated_context),
) -> GraphSnapshot:
    """Entity co-occurrence graph — which entities keep appearing together across intelligence runs."""
    return graph.cross_entity_graph(
        tenant_id=auth.tenant_id,
        min_co_occurrences=min_co_occurrences,
        limit=limit,
    )


@router.get("/runs/{run_id}/lineage", response_model=GraphSnapshot)
async def run_lineage_graph(
    run_id: str,
    graph: Neo4jGraphClient = Depends(get_graph_service),
    auth: AuthContext = Depends(authenticated_context),
) -> GraphSnapshot:
    """Full lineage graph for a single intelligence run: inputs → evidence → signals → risks → actions."""
    return graph.run_lineage(run_id=run_id, tenant_id=auth.tenant_id)
