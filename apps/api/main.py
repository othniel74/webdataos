from contextlib import asynccontextmanager
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from starlette.responses import JSONResponse, Response
from sqlalchemy import text
from apps.api.db.models import Base, Tenant, Topic
from apps.api.db.session import AsyncSessionLocal, engine
from apps.api.routes.agent import router as agent_router
from apps.api.routes.auth import router as auth_router
from apps.api.routes.gateway import router as gateway_router
from apps.api.routes.intelligence import router as intelligence_router
from apps.api.routes.runs import router as runs_router
from apps.api.routes.partners import router as partners_router
from apps.api.routes.workspaces import router as workspaces_router
from apps.api.routes.analyst import router as analyst_router
from apps.api.routes.llm import router as llm_router
from apps.api.routes.graph import router as graph_router
from apps.api.routes.monitor import router as monitor_router
from apps.api.routes.chat import router as chat_router
from apps.api.routes.triggerware import router as triggerware_router
from apps.api.routes.demo import router as demo_router
from packages.enterprise.packs import list_packs
from packages.common.config import get_settings
from packages.common.logging import configure_logging, get_logger
from packages.common.errors import BrightDataError
from packages.graph.neo4j_client import Neo4jGraphClient
from packages.observability.otel import configure_otel

configure_logging()
logger = get_logger(__name__)
settings = get_settings()


def auth_is_enforced() -> bool:
    return settings.api_auth_enabled or settings.auth_mode.lower() in {"clerk", "custom", "mixed"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.is_production:
        logger.info("production_startup", message="Use Alembic migrations in production instead of create_all.")
    else:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    await seed_defaults()
    logger.info(
        "app_started",
        env=settings.app_env,
        auth_enabled=auth_is_enforced(),
        mock_brightdata=settings.mock_brightdata,
    )
    yield
    logger.info("app_stopped")


async def seed_defaults() -> None:
    async with AsyncSessionLocal() as db:
        for tenant_id, name, tenant_type in [
            (settings.default_tenant_id, "Internal WebDataOS", "internal"),
            (settings.demo_tenant_id, "Public Demo", "demo"),
        ]:
            tenant = await db.get(Tenant, tenant_id)
            if not tenant:
                db.add(Tenant(id=tenant_id, name=name, tenant_type=tenant_type))
        for pack in list_packs():
            topic_id = f"workspace_{pack.id}"
            existing = await db.get(Topic, topic_id)
            if existing:
                continue
            db.add(
                Topic(
                    id=topic_id,
                    tenant_id=settings.default_tenant_id,
                    name=pack.name,
                    description=f"package_id={pack.id}; {pack.description}",
                    entities=pack.entities,
                    watch_types=pack.signals,
                    refresh_frequency_minutes=1440,
                )
            )
        await db.commit()


app = FastAPI(title="WebDataOS Enterprise Intelligence API", version="0.5.0", lifespan=lifespan)
configure_otel(app)

if settings.trusted_hosts_list:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_hosts_list + (["*"] if settings.app_env == "development" else []))

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list or ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key", "X-Demo-Session"],
)


@app.middleware("http")
async def request_size_guard(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > settings.request_body_max_bytes:
        return JSONResponse(status_code=413, content={"detail": "Request body too large"})
    return await call_next(request)


@app.exception_handler(BrightDataError)
async def brightdata_exception_handler(_: Request, exc: BrightDataError):
    return JSONResponse(status_code=502, content={"detail": str(exc), "type": "brightdata_upstream_error"})


app.include_router(auth_router)
app.include_router(workspaces_router)
app.include_router(gateway_router)
app.include_router(intelligence_router)
app.include_router(agent_router)
app.include_router(partners_router)
app.include_router(runs_router)
app.include_router(analyst_router)
app.include_router(llm_router)
app.include_router(graph_router)
app.include_router(monitor_router)
app.include_router(chat_router)
app.include_router(triggerware_router)
app.include_router(demo_router)


@app.get("/health")
async def health():
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "error"
    neo4j_status = Neo4jGraphClient().health()
    return {
        "status": "ok" if db_status == "ok" else "degraded",
        "database": db_status,
        "neo4j": neo4j_status,
        "mock_brightdata": settings.mock_brightdata,
        "brightdata_live": bool(settings.brightdata_api_key) and not settings.mock_brightdata,
        "llm_available": bool(settings.openai_api_key or settings.aimlapi_api_key),
        "llm_provider": "+".join(
            provider
            for provider, enabled in {
                "openai": bool(settings.openai_api_key),
                "aimlapi": bool(settings.aimlapi_api_key),
            }.items()
            if enabled
        )
        or None,
        "llm_models": {
            "openai": settings.openai_model if settings.openai_api_key else None,
            "aimlapi": settings.aimlapi_model if settings.aimlapi_api_key else None,
        },
        "partner_apis": {
            "speechmatics": bool(settings.speechmatics_api_key),
            "triggerware": bool(settings.triggerware_endpoint or settings.triggerware_api_key),
            "cognee_local": bool(settings.openai_api_key or settings.aimlapi_api_key or os.getenv("LLM_API_KEY")),
            "cognee_cloud": bool(settings.cognee_endpoint and settings.cognee_api_key),
        },
        "auth_enabled": auth_is_enforced(),
        "auth_mode": settings.auth_mode,
        "public_demo_enabled": settings.public_demo_enabled,
        "version": "0.5.0",
    }


@app.get("/ready")
async def ready():
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    return {"status": "ready"}


@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
