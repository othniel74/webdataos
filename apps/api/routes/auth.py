from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from apps.api.db.models import Tenant, UserAccount
from apps.api.db.session import get_db
from apps.api.dependencies import authenticated_context
from packages.common.auth import create_session_token, hash_password, normalize_email, verify_password
from packages.common.config import get_settings
from packages.common.security import AuthContext

router = APIRouter(prefix="/auth", tags=["Auth"])


class AuthSignup(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    organization: str | None = Field(default=None, max_length=160)


class AuthLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


def _public_user(account: UserAccount) -> dict:
    return {
        "id": account.id,
        "tenant_id": account.tenant_id,
        "name": account.name,
        "email": account.email,
        "role": account.role,
    }


def _token_payload(account: UserAccount) -> dict:
    settings = get_settings()
    token = create_session_token(
        settings=settings,
        user_id=account.id,
        tenant_id=account.tenant_id,
        email=account.email,
        role=account.role,
    )
    return {
        "token": token,
        "token_type": "bearer",
        "expires_in": settings.auth_token_ttl_hours * 3600,
        "user": _public_user(account),
    }


@router.post("/signup")
async def signup(payload: AuthSignup, db: AsyncSession = Depends(get_db)):
    email = normalize_email(payload.email)
    existing = await db.execute(select(UserAccount).where(UserAccount.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account already exists for this email.")

    tenant_id = f"tenant_{uuid.uuid4().hex[:16]}"
    account = UserAccount(
        id=f"user_{uuid.uuid4().hex}",
        tenant_id=tenant_id,
        email=email,
        name=payload.name.strip(),
        password_hash=hash_password(payload.password),
        role="admin",
        status="active",
    )
    db.add(
        Tenant(
            id=tenant_id,
            name=(payload.organization or payload.name).strip(),
            tenant_type="customer",
            status="active",
        )
    )
    db.add(account)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account already exists for this email.") from exc
    await db.refresh(account)
    return _token_payload(account)


@router.post("/login")
async def login(payload: AuthLogin, db: AsyncSession = Depends(get_db)):
    email = normalize_email(payload.email)
    result = await db.execute(select(UserAccount).where(UserAccount.email == email))
    account = result.scalar_one_or_none()
    if not account or not verify_password(payload.password, account.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")
    if account.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is not active.")
    return _token_payload(account)


@router.get("/me")
async def me(
    auth: AuthContext = Depends(authenticated_context),
    db: AsyncSession = Depends(get_db),
):
    if auth.auth_type == "session" and auth.user_id:
        account = await db.get(UserAccount, auth.user_id)
        if account and account.status == "active":
            return {"user": _public_user(account)}
    return {
        "user": {
            "id": auth.user_id or auth.principal,
            "tenant_id": auth.tenant_id,
            "name": auth.principal,
            "email": auth.principal if "@" in auth.principal else "",
            "role": auth.role,
        }
    }
