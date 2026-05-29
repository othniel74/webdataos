from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from apps.api.db.session import get_db
from apps.api.dependencies import authenticated_context, get_intelligence_service
from apps.api.workspace_resolution import resolve_workspace, workspace_id_for_tenant
from packages.common.security import AuthContext
from packages.intelligence.service import IntelligenceService
from packages.schemas.intelligence import TopicCreate, TopicRead, SourceRecord, IntelligenceRecordRead, RetrievalRequest, RetrievalResult

router = APIRouter(prefix="/intelligence", tags=["Track 2 - Intelligence"], dependencies=[Depends(authenticated_context)])


@router.post("/topics", response_model=TopicRead)
async def create_topic(
    topic: TopicCreate,
    db: AsyncSession = Depends(get_db),
    service: IntelligenceService = Depends(get_intelligence_service),
    auth: AuthContext = Depends(authenticated_context),
):
    topic.id = workspace_id_for_tenant(topic.id, auth)
    return await service.create_topic(db, topic, tenant_id=auth.tenant_id)


@router.get("/topics", response_model=list[TopicRead])
async def list_topics(
    db: AsyncSession = Depends(get_db),
    service: IntelligenceService = Depends(get_intelligence_service),
    auth: AuthContext = Depends(authenticated_context),
):
    return await service.list_topics(db, tenant_id=auth.tenant_id)


@router.post("/topics/{topic_id}/discover", response_model=list[SourceRecord])
async def discover(
    topic_id: str,
    limit: int = 8,
    query: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    service: IntelligenceService = Depends(get_intelligence_service),
    auth: AuthContext = Depends(authenticated_context),
):
    topic = await resolve_workspace(db, topic_id, auth)
    topic_id = topic.id if topic else workspace_id_for_tenant(topic_id, auth)
    return await service.discover_sources(db, topic_id, limit=limit, query=query, tenant_id=auth.tenant_id)


@router.post("/topics/{topic_id}/refresh")
async def refresh(
    topic_id: str,
    max_sources: int = 8,
    query: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    service: IntelligenceService = Depends(get_intelligence_service),
    auth: AuthContext = Depends(authenticated_context),
):
    topic = await resolve_workspace(db, topic_id, auth)
    topic_id = topic.id if topic else workspace_id_for_tenant(topic_id, auth)
    return await service.refresh_topic(db, topic_id, max_sources=max_sources, query=query, tenant_id=auth.tenant_id)


@router.get("/records", response_model=list[IntelligenceRecordRead])
async def records(
    topic_id: str | None = Query(default=None),
    include_stale: bool = Query(default=False),
    freshness_required_days: int = Query(default=7, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    service: IntelligenceService = Depends(get_intelligence_service),
    auth: AuthContext = Depends(authenticated_context),
):
    if topic_id:
        topic = await resolve_workspace(db, topic_id, auth)
        topic_id = topic.id if topic else workspace_id_for_tenant(topic_id, auth)
    return await service.list_records(
        db,
        topic_id=topic_id,
        tenant_id=auth.tenant_id,
        include_stale=include_stale,
        freshness_required_days=freshness_required_days,
    )


@router.post("/retrieve", response_model=list[RetrievalResult])
async def retrieve_alias(
    req: RetrievalRequest,
    db: AsyncSession = Depends(get_db),
    service: IntelligenceService = Depends(get_intelligence_service),
    auth: AuthContext = Depends(authenticated_context),
):
    topic = await resolve_workspace(db, req.topic_id, auth)
    req.topic_id = topic.id if topic else workspace_id_for_tenant(req.topic_id, auth)
    return await service.retrieve_context(db, req, tenant_id=auth.tenant_id)


@router.post("/retrieval/context", response_model=list[RetrievalResult])
async def retrieve(
    req: RetrievalRequest,
    db: AsyncSession = Depends(get_db),
    service: IntelligenceService = Depends(get_intelligence_service),
    auth: AuthContext = Depends(authenticated_context),
):
    topic = await resolve_workspace(db, req.topic_id, auth)
    req.topic_id = topic.id if topic else workspace_id_for_tenant(req.topic_id, auth)
    return await service.retrieve_context(db, req, tenant_id=auth.tenant_id)
