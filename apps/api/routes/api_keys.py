from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.db.models import ManagedAPIKey
from apps.api.db.session import get_db
from apps.api.dependencies import authenticated_context, require_admin
from packages.common.security import AuthContext

router = APIRouter(prefix="/api-keys", tags=["API Keys"])

PREFIX = "wdos_"


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


class CreateKeyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    expires_in_days: int | None = Field(default=None, ge=1, le=3650, description="Days until expiry. Omit for no expiry.")


class KeySummary(BaseModel):
    id: str
    name: str
    prefix: str
    created_by: str | None
    created_at: datetime
    last_used_at: datetime | None
    expires_at: datetime | None
    expired: bool
    revoked: bool


class CreateKeyResponse(BaseModel):
    id: str
    name: str
    prefix: str
    expires_at: datetime | None
    key: str  # raw value — shown once, never stored


class RotateKeyResponse(BaseModel):
    old_key_id: str
    new_key_id: str
    name: str
    prefix: str
    expires_at: datetime | None
    key: str  # new raw value — shown once, never stored


def _summary(k: ManagedAPIKey) -> KeySummary:
    exp = k.expires_at
    expired = bool(exp and exp.replace(tzinfo=timezone.utc) < _now()) if exp else False
    return KeySummary(
        id=k.id,
        name=k.name,
        prefix=k.key_prefix,
        created_by=k.created_by,
        created_at=k.created_at,
        last_used_at=k.last_used_at,
        expires_at=exp,
        expired=expired,
        revoked=k.revoked,
    )


@router.get("", response_model=list[KeySummary])
async def list_keys(
    auth: AuthContext = Depends(authenticated_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ManagedAPIKey)
        .where(ManagedAPIKey.tenant_id == auth.tenant_id, ManagedAPIKey.revoked.is_(False))
        .order_by(ManagedAPIKey.created_at.desc())
    )
    return [_summary(k) for k in result.scalars().all()]


@router.post("", response_model=CreateKeyResponse, status_code=201)
async def create_key(
    body: CreateKeyRequest,
    auth: AuthContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new API key. The raw key value is returned once and never stored — save it immediately."""
    existing_count = await db.scalar(
        select(func.count()).select_from(ManagedAPIKey).where(
            ManagedAPIKey.tenant_id == auth.tenant_id,
            ManagedAPIKey.revoked.is_(False),
        )
    )
    if (existing_count or 0) >= 20:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Maximum of 20 active keys per tenant")

    from datetime import timedelta
    expires_at = _now() + timedelta(days=body.expires_in_days) if body.expires_in_days else None
    raw = PREFIX + secrets.token_urlsafe(32)
    key = ManagedAPIKey(
        id=str(uuid4()),
        tenant_id=auth.tenant_id,
        name=body.name,
        key_hash=_hash_key(raw),
        key_prefix=raw[:12],
        created_by=auth.principal,
        expires_at=expires_at,
    )
    db.add(key)
    await db.commit()
    return CreateKeyResponse(id=key.id, name=key.name, prefix=key.key_prefix, expires_at=expires_at, key=raw)


@router.post("/{key_id}/rotate", response_model=RotateKeyResponse)
async def rotate_key(
    key_id: str,
    auth: AuthContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Rotate a key — atomically revokes the old one and issues a new key with the same name and expiry window.
    The new raw value is returned once and never stored — save it immediately."""
    old = await db.get(ManagedAPIKey, key_id)
    if not old or old.tenant_id != auth.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Key not found")
    if old.revoked:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Key is already revoked")

    # Preserve remaining TTL if the old key had an expiry
    expires_at: datetime | None = None
    if old.expires_at:
        remaining = old.expires_at.replace(tzinfo=timezone.utc) - _now()
        if remaining.total_seconds() > 0:
            expires_at = _now() + remaining

    raw = PREFIX + secrets.token_urlsafe(32)
    new_key = ManagedAPIKey(
        id=str(uuid4()),
        tenant_id=auth.tenant_id,
        name=old.name,
        key_hash=_hash_key(raw),
        key_prefix=raw[:12],
        created_by=auth.principal,
        expires_at=expires_at,
    )
    old.revoked = True
    db.add(new_key)
    await db.commit()
    return RotateKeyResponse(
        old_key_id=key_id,
        new_key_id=new_key.id,
        name=new_key.name,
        prefix=new_key.key_prefix,
        expires_at=expires_at,
        key=raw,
    )


@router.delete("/{key_id}", status_code=200)
async def revoke_key(
    key_id: str,
    auth: AuthContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Revoke an API key. Revoked keys are rejected immediately."""
    key = await db.get(ManagedAPIKey, key_id)
    if not key or key.tenant_id != auth.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Key not found")
    if key.revoked:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Key is already revoked")
    key.revoked = True
    await db.commit()
    return {"revoked": True, "id": key_id}
