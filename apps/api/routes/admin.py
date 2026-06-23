"""System super-admin routes — user management, tenant overview."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.db.models import Tenant, UserAccount
from apps.api.db.session import get_db
from apps.api.dependencies import authenticated_context
from packages.common.auth import hash_password, normalize_email
from packages.common.config import get_settings
from packages.common.security import AuthContext

router = APIRouter(prefix="/admin", tags=["System Admin"])


def _require_super_admin(auth: AuthContext = Depends(authenticated_context)) -> AuthContext:
    settings = get_settings()
    principal = (auth.principal or "").lower()
    super_email = settings.super_admin_email.lower()
    if principal != super_email:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super-admin access required.")
    return auth


class CreateUserPayload(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    organization: str | None = Field(default=None, max_length=160)
    role: str = "admin"


class UpdateUserStatus(BaseModel):
    status: str  # "active" | "banned" | "suspended"


def _user_dict(u: UserAccount) -> dict:
    return {
        "id": u.id,
        "tenant_id": u.tenant_id,
        "email": u.email,
        "name": u.name,
        "role": u.role,
        "status": u.status,
        "created_at": str(u.created_at) if u.created_at else None,
    }


@router.get("/users")
async def list_users(
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(_require_super_admin),
) -> list[dict]:
    result = await db.execute(select(UserAccount).order_by(UserAccount.created_at.desc()))
    return [_user_dict(u) for u in result.scalars().all()]


@router.post("/users", status_code=201)
async def create_user(
    payload: CreateUserPayload,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(_require_super_admin),
) -> dict:
    email = normalize_email(payload.email)
    existing = await db.execute(select(UserAccount).where(UserAccount.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="An account already exists for this email.")

    tenant_id = f"tenant_{uuid.uuid4().hex[:16]}"
    account = UserAccount(
        id=f"user_{uuid.uuid4().hex}",
        tenant_id=tenant_id,
        email=email,
        name=payload.name.strip(),
        password_hash=hash_password(payload.password),
        role=payload.role,
        status="active",
    )
    db.add(Tenant(
        id=tenant_id,
        name=(payload.organization or payload.name).strip(),
        tenant_type="customer",
        status="active",
    ))
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return _user_dict(account)


@router.patch("/users/{user_id}/status")
async def update_user_status(
    user_id: str,
    payload: UpdateUserStatus,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(_require_super_admin),
) -> dict:
    if payload.status not in {"active", "banned", "suspended"}:
        raise HTTPException(status_code=400, detail="status must be active, banned, or suspended.")
    account = await db.get(UserAccount, user_id)
    if not account:
        raise HTTPException(status_code=404, detail="User not found.")
    settings = get_settings()
    if account.email.lower() == settings.super_admin_email.lower():
        raise HTTPException(status_code=403, detail="Cannot modify the super-admin account.")
    account.status = payload.status
    await db.commit()
    return _user_dict(account)
