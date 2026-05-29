import hashlib
import hmac
from dataclasses import dataclass
from fastapi import Header, HTTPException, Request, status
from packages.common.config import get_settings


@dataclass(frozen=True)
class AuthContext:
    principal: str
    key_fingerprint: str
    auth_enabled: bool


def fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() == "bearer" and token:
        return token.strip()
    return None


async def require_api_key(
    request: Request,
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> AuthContext:
    settings = get_settings()
    if not settings.api_auth_enabled:
        return AuthContext(principal="dev-anonymous", key_fingerprint="dev", auth_enabled=False)

    configured = settings.api_key_set
    if not configured:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="API auth is enabled but no API_KEYS are configured.",
        )

    provided = x_api_key or _extract_bearer(authorization)
    if not provided:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing API key")

    if not any(hmac.compare_digest(provided, expected) for expected in configured):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid API key")

    return AuthContext(principal="api-key", key_fingerprint=fingerprint(provided), auth_enabled=True)
