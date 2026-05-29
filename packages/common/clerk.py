from __future__ import annotations

from typing import Any

import jwt
from jwt import PyJWKClient

from packages.common.config import Settings

_jwks_clients: dict[str, PyJWKClient] = {}


def _client(jwks_url: str) -> PyJWKClient:
    if jwks_url not in _jwks_clients:
        _jwks_clients[jwks_url] = PyJWKClient(jwks_url)
    return _jwks_clients[jwks_url]


def _normalize_issuer(value: str | None) -> str | None:
    if not value:
        return None
    return value.strip().rstrip("/")


def _issuer_candidates(value: str | None) -> set[str]:
    issuer = _normalize_issuer(value)
    if not issuer:
        return set()
    candidates = {issuer}
    if "://" not in issuer:
        candidates.add(f"https://{issuer}")
    return {_normalize_issuer(candidate) for candidate in candidates if candidate}


def _issuer_allowed(actual: str | None, expected: str | None) -> bool:
    expected_candidates = _issuer_candidates(expected)
    if not expected_candidates:
        return True
    return _normalize_issuer(actual) in expected_candidates


def verify_clerk_token(token: str, settings: Settings) -> dict[str, Any]:
    """Verify a Clerk session JWT and return claims.

    Clerk verification is enabled only when JWKS configuration is present. The
    backend uses the verified `sub` and organization claims to build tenant
    context; route handlers remain responsible for enforcing permissions.
    """
    if not settings.clerk_jwks_url:
        raise ValueError("CLERK_JWKS_URL is required for Clerk auth mode.")

    signing_key = _client(settings.clerk_jwks_url).get_signing_key_from_jwt(token)
    options = {
        "verify_aud": bool(settings.clerk_audience),
        "verify_iss": False,
    }
    claims = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=settings.clerk_audience,
        options=options,
    )
    if not _issuer_allowed(claims.get("iss"), settings.clerk_issuer):
        raise jwt.InvalidIssuerError("Invalid issuer")
    return claims
