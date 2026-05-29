from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.db.models import Topic
from apps.api.db.session import get_db
from apps.api.dependencies import authenticated_context
from packages.enterprise.packs import get_pack, list_packs, package_id_from_description
from packages.schemas.workspace import IntelligencePackRead, WorkspaceCreate, WorkspaceRead

router = APIRouter(prefix="/workspaces", tags=["Enterprise Workspaces"], dependencies=[Depends(authenticated_context)])


def _slug(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "_", value.strip().lower()).strip("_")
    return cleaned or f"workspace_{uuid.uuid4().hex[:8]}"


def _pack_payload(pack_id: str) -> dict:
    pack = get_pack(pack_id)
    return {
        "id": pack.id,
        "name": pack.name,
        "tier": pack.tier,
        "description": pack.description,
        "entities": pack.entities,
        "signals": pack.signals,
        "brightdata_routes": pack.brightdata_routes,
        "input_channels": pack.input_channels,
        "partner_routes": pack.partner_routes,
        "output_focus": pack.output_focus,
    }


def _workspace_read(topic: Topic) -> WorkspaceRead:
    package_id = package_id_from_description(topic.description)
    pack = get_pack(package_id)
    return WorkspaceRead(
        id=topic.id,
        name=topic.name,
        package_id=pack.id,
        description=topic.description,
        entities=topic.entities or [],
        signals=topic.watch_types or [],
        brightdata_routes=pack.brightdata_routes,
        input_channels=pack.input_channels,
        partner_routes=pack.partner_routes,
        refresh_frequency_minutes=topic.refresh_frequency_minutes,
        created_at=str(topic.created_at) if topic.created_at else None,
    )


@router.get("/packages", response_model=list[IntelligencePackRead])
async def packages() -> list[IntelligencePackRead]:
    return [IntelligencePackRead(**_pack_payload(pack.id)) for pack in list_packs()]


@router.post("", response_model=WorkspaceRead)
async def create_workspace(payload: WorkspaceCreate, db: AsyncSession = Depends(get_db)) -> WorkspaceRead:
    pack = get_pack(payload.package_id)
    workspace_id = payload.id or _slug(payload.name)
    existing = await db.get(Topic, workspace_id)
    if existing:
        existing.name = payload.name
        existing.description = f"package_id={pack.id}; {payload.description or pack.description}"
        existing.entities = payload.entities or pack.entities
        existing.watch_types = payload.signals or pack.signals
        existing.refresh_frequency_minutes = payload.refresh_frequency_minutes
        await db.commit()
        return _workspace_read(existing)
    topic = Topic(
        id=workspace_id,
        name=payload.name,
        description=f"package_id={pack.id}; {payload.description or pack.description}",
        entities=payload.entities or pack.entities,
        watch_types=payload.signals or pack.signals,
        refresh_frequency_minutes=payload.refresh_frequency_minutes,
    )
    db.add(topic)
    await db.commit()
    return _workspace_read(topic)


@router.get("", response_model=list[WorkspaceRead])
async def list_workspaces(db: AsyncSession = Depends(get_db)) -> list[WorkspaceRead]:
    result = await db.execute(select(Topic).order_by(Topic.created_at.desc()))
    return [_workspace_read(topic) for topic in result.scalars().all()]


@router.get("/{workspace_id}", response_model=WorkspaceRead)
async def get_workspace(workspace_id: str, db: AsyncSession = Depends(get_db)) -> WorkspaceRead:
    topic = await db.get(Topic, workspace_id)
    if not topic:
        pack = get_pack("enterprise")
        topic = Topic(
            id=workspace_id,
            name=workspace_id.replace("_", " ").title(),
            description=f"package_id={pack.id}; {pack.description}",
            entities=pack.entities,
            watch_types=pack.signals,
            refresh_frequency_minutes=1440,
        )
        db.add(topic)
        await db.commit()
    return _workspace_read(topic)
