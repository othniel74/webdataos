from fastapi import APIRouter, Depends, Query

from apps.api.dependencies import authenticated_context, get_graph_service
from packages.graph.neo4j_client import Neo4jGraphClient
from packages.schemas.intelligence import GraphSnapshot, GraphStatus

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


@router.get("/entities/{entity}", response_model=GraphSnapshot)
async def entity_graph(
    entity: str,
    limit: int = Query(default=60, ge=1, le=200),
    graph: Neo4jGraphClient = Depends(get_graph_service),
) -> GraphSnapshot:
    return graph.entity_neighborhood(entity, limit=limit)
