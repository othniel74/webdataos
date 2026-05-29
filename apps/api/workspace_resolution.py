from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.db.models import Topic
from packages.common.config import get_settings
from packages.common.identifiers import normalize_workspace_id
from packages.common.security import AuthContext
from packages.enterprise.packs import get_pack


def workspace_id_for_tenant(workspace_id: str | None, auth: AuthContext) -> str:
    normalized = normalize_workspace_id(workspace_id)
    settings = get_settings()
    if auth.tenant_id == settings.default_tenant_id or normalized.startswith(f"{auth.tenant_id}_"):
        return normalized
    return f"{auth.tenant_id}_{normalized}"


async def resolve_workspace(
    db: AsyncSession,
    workspace_id: str | None,
    auth: AuthContext,
) -> Topic | None:
    normalized = normalize_workspace_id(workspace_id)
    scoped_id = workspace_id_for_tenant(normalized, auth)
    for candidate_id in dict.fromkeys([scoped_id, normalized]):
        topic = await db.get(Topic, candidate_id)
        if topic and topic.tenant_id == auth.tenant_id:
            return topic
    return None


async def ensure_workspace(
    db: AsyncSession,
    workspace_id: str | None,
    auth: AuthContext,
    package_id: str = "enterprise",
    name: str | None = None,
    description: str | None = None,
    entities: list[str] | None = None,
    signals: list[str] | None = None,
    refresh_frequency_minutes: int = 1440,
) -> Topic:
    existing = await resolve_workspace(db, workspace_id, auth)
    if existing:
        return existing

    pack = get_pack(package_id)
    topic_id = workspace_id_for_tenant(workspace_id, auth)
    topic = Topic(
        id=topic_id,
        tenant_id=auth.tenant_id,
        name=name or topic_id.replace("_", " ").title(),
        description=f"package_id={pack.id}; {description or pack.description}",
        entities=entities or pack.entities,
        watch_types=signals or pack.signals,
        refresh_frequency_minutes=refresh_frequency_minutes,
    )
    db.add(topic)
    await db.commit()
    await db.refresh(topic)
    return topic
