from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from starlette.responses import JSONResponse, Response
from sqlalchemy import text
from apps.api.db.models import Base, Topic
from apps.api.db.session import AsyncSessionLocal, engine
from apps.api.routes.agent import router as agent_router
from apps.api.routes.gateway import router as gateway_router
from apps.api.routes.intelligence import router as intelligence_router
from apps.api.routes.runs import router as runs_router
from apps.api.routes.partners import router as partners_router
from apps.api.routes.workspaces import router as workspaces_router
from apps.api.routes.analyst import router as analyst_router
from packages.enterprise.packs import list_packs
from packages.common.config import get_settings
from packages.common.logging import configure_logging, get_logger
from packages.common.errors import BrightDataError
from packages.observability.otel import configure_otel

configure_logging()
logger = get_logger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.is_production:
        logger.info("production_startup", message="Use Alembic migrations in production instead of create_all.")
    else:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    await seed_defaults()
    logger.info("app_started", env=settings.app_env, auth_enabled=settings.api_auth_enabled, mock_brightdata=settings.mock_brightdata)
    yield
    logger.info("app_stopped")


async def seed_defaults() -> None:
    async with AsyncSessionLocal() as db:
        for pack in list_packs():
            topic_id = f"workspace_{pack.id}"
            existing = await db.get(Topic, topic_id)
            if existing:
                continue
            db.add(
                Topic(
                    id=topic_id,
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
    allow_origins=settings.cors_origins_list or ["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key"],
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


app.include_router(workspaces_router)
app.include_router(gateway_router)
app.include_router(intelligence_router)
app.include_router(agent_router)
app.include_router(partners_router)
app.include_router(runs_router)
app.include_router(analyst_router)


@app.get("/health")
async def health():
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "error"
    return {
        "status": "ok" if db_status == "ok" else "degraded",
        "database": db_status,
        "mock_brightdata": settings.mock_brightdata,
        "auth_enabled": settings.api_auth_enabled,
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
