import hashlib
import hmac
import re
from dataclasses import dataclass
from fastapi import Header, HTTPException, Request, status
from jwt import PyJWTError
from packages.common.auth import verify_session_token
from packages.common.clerk import verify_clerk_token
from packages.common.config import get_settings


@dataclass(frozen=True)
class AuthContext:
    principal: str
    key_fingerprint: str
    auth_enabled: bool
    tenant_id: str = "tenant_internal"
    user_id: str | None = None
    org_id: str | None = None
    role: str = "admin"
    auth_type: str = "api_key"
    is_demo: bool = False


def fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() == "bearer" and token:
        return token.strip()
    return None


def _tenant_component(value: str | None, fallback: str = "unknown") -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", value or "").strip("_")
    return cleaned[:80] or fallback


async def require_api_key(
    request: Request,
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> AuthContext:
    settings = get_settings()
    bearer = _extract_bearer(authorization)
    auth_mode = settings.auth_mode.lower()
    protected_auth_mode = auth_mode in {"clerk", "custom", "mixed"}

    def _return(ctx: AuthContext) -> AuthContext:
        if request is not None:
            request.state.auth_context = ctx
        return ctx

    if bearer and protected_auth_mode:
        try:
            claims = verify_session_token(bearer, settings)
        except PyJWTError:
            pass
        else:
            return _return(AuthContext(
                principal=claims.get("email") or claims.get("sub") or "webdataos-user",
                key_fingerprint=fingerprint(bearer),
                auth_enabled=True,
                tenant_id=claims["tenant_id"],
                user_id=claims.get("sub"),
                role=claims.get("role") or "analyst",
                auth_type="session",
            ))

        try:
            claims = verify_clerk_token(bearer, settings)
        except (PyJWTError, ValueError) as exc:
            if auth_mode == "clerk" or not x_api_key:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session") from exc
        else:
            user_id = claims.get("sub")
            org_id = claims.get("org_id") or claims.get("orgid")
            tenant_id = (
                f"clerk_org_{_tenant_component(org_id)}"
                if org_id
                else f"clerk_user_{_tenant_component(user_id)}"
            )
            role = claims.get("org_role") or claims.get("role") or "analyst"
            return _return(AuthContext(
                principal=user_id or "clerk-user",
                key_fingerprint=fingerprint(bearer),
                auth_enabled=True,
                tenant_id=tenant_id,
                user_id=user_id,
                org_id=org_id,
                role=role,
                auth_type="clerk",
            ))

    if auth_mode == "clerk":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing session")

    if not settings.api_auth_enabled and not protected_auth_mode:
        return _return(AuthContext(
            principal="dev-anonymous",
            key_fingerprint="dev",
            auth_enabled=False,
            tenant_id=settings.default_tenant_id,
            auth_type="dev",
        ))

    configured = settings.api_key_set
    if not configured:
        if protected_auth_mode:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing session")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="API auth is enabled but no API_KEYS are configured.")

    provided = x_api_key or bearer
    if not provided:
        detail = "Missing session or API key" if auth_mode in {"mixed", "custom"} else "Missing API key"
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)

    if not any(hmac.compare_digest(provided, expected) for expected in configured):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid API key")

    return _return(AuthContext(
        principal="api-key",
        key_fingerprint=fingerprint(provided),
        auth_enabled=True,
        tenant_id=settings.default_tenant_id,
        auth_type="api_key",
    ))


def require_role(*allowed_roles: str):
    """FastAPI dependency factory that enforces a role allowlist.

    Usage::

        @router.delete("/{id}", dependencies=[Depends(require_role("admin"))])
    """
    from fastapi import Depends

    async def _check(auth: AuthContext = Depends(require_api_key)) -> AuthContext:
        if auth.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{auth.role}' is not authorized. Required: {', '.join(allowed_roles)}",
            )
        return auth

    return _check
