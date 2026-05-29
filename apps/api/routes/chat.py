import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.db.models import ChatMessage
from apps.api.db.session import get_db
from apps.api.dependencies import authenticated_context
from packages.common.identifiers import normalize_workspace_id
from packages.common.security import AuthContext

router = APIRouter(prefix="/chat", tags=["Chat"], dependencies=[Depends(authenticated_context)])


class ChatMessageCreate(BaseModel):
    role: Literal["user", "assistant", "system"] = "user"
    content: str = Field(min_length=1, max_length=20000)
    run_id: str | None = None
    metadata: dict = Field(default_factory=dict)


def _serialize(message: ChatMessage) -> dict:
    return {
        "id": message.id,
        "workspace_id": message.workspace_id,
        "role": message.role,
        "content": message.content,
        "run_id": message.run_id,
        "metadata": message.metadata_json or {},
        "created_at": message.created_at.isoformat() if message.created_at else None,
    }


@router.get("/{workspace_id}")
async def list_chat_messages(
    workspace_id: str,
    limit: int = Query(default=80, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(authenticated_context),
):
    workspace_id = normalize_workspace_id(workspace_id)
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.workspace_id == workspace_id, ChatMessage.tenant_id == auth.tenant_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    )
    messages = list(reversed(result.scalars().all()))
    return [_serialize(message) for message in messages]


@router.post("/{workspace_id}")
async def create_chat_message(
    workspace_id: str,
    payload: ChatMessageCreate,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(authenticated_context),
):
    workspace_id = normalize_workspace_id(workspace_id)
    message = ChatMessage(
        id=str(uuid.uuid4()),
        tenant_id=auth.tenant_id,
        workspace_id=workspace_id,
        role=payload.role,
        content=payload.content.strip(),
        run_id=payload.run_id,
        metadata_json=payload.metadata,
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return _serialize(message)


@router.delete("/{workspace_id}")
async def clear_chat_messages(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(authenticated_context),
):
    workspace_id = normalize_workspace_id(workspace_id)
    await db.execute(
        delete(ChatMessage).where(ChatMessage.workspace_id == workspace_id, ChatMessage.tenant_id == auth.tenant_id)
    )
    await db.commit()
    return {"status": "cleared", "workspace_id": workspace_id}
