from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import timedelta
from typing import Any

import jwt
from jwt import PyJWTError

from packages.common.config import Settings
from packages.common.time import utc_now

PASSWORD_SCHEME = "pbkdf2_sha256"
PASSWORD_ITERATIONS = 210_000


def normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_ITERATIONS,
    )
    return ":".join(
        [
            PASSWORD_SCHEME,
            str(PASSWORD_ITERATIONS),
            base64.b64encode(salt).decode("ascii"),
            base64.b64encode(digest).decode("ascii"),
        ]
    )


def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, iterations, salt_b64, digest_b64 = encoded.split(":", 3)
        if scheme != PASSWORD_SCHEME:
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
        actual = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            int(iterations),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


def auth_secret(settings: Settings) -> str:
    if settings.auth_jwt_secret:
        return settings.auth_jwt_secret
    if settings.api_keys:
        return settings.api_keys
    return "dev-webdataos-auth-secret-change-me"


def create_session_token(
    *,
    settings: Settings,
    user_id: str,
    tenant_id: str,
    email: str,
    role: str,
) -> str:
    now = utc_now()
    payload = {
        "iss": "webdataos",
        "sub": user_id,
        "tenant_id": tenant_id,
        "email": normalize_email(email),
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=settings.auth_token_ttl_hours)).timestamp()),
    }
    return jwt.encode(payload, auth_secret(settings), algorithm="HS256")


def verify_session_token(token: str, settings: Settings) -> dict[str, Any]:
    claims = jwt.decode(
        token,
        auth_secret(settings),
        algorithms=["HS256"],
        issuer="webdataos",
        options={"require": ["sub", "tenant_id", "email", "exp"]},
    )
    if not claims.get("tenant_id") or not claims.get("sub"):
        raise PyJWTError("Missing tenant or subject")
    return claims
