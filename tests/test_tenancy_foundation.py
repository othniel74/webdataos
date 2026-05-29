import pytest
from fastapi import HTTPException

from packages.common.config import get_settings
from packages.common.auth import create_session_token, hash_password, verify_password
from packages.common.clerk import _issuer_allowed
from packages.common.security import require_api_key
from apps.api.routes.demo import DEMO_MISSIONS, _workspace_id


@pytest.mark.asyncio
async def test_dev_auth_context_uses_default_tenant(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "api_key")
    monkeypatch.setenv("API_AUTH_ENABLED", "false")
    monkeypatch.setenv("DEFAULT_TENANT_ID", "tenant_local")
    get_settings.cache_clear()

    auth = await require_api_key(request=None, authorization=None, x_api_key=None)

    assert auth.auth_type == "dev"
    assert auth.tenant_id == "tenant_local"
    assert auth.role == "admin"
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_clerk_mode_requires_verifiable_session(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "clerk")
    monkeypatch.setenv("API_AUTH_ENABLED", "true")
    monkeypatch.setenv("CLERK_JWKS_URL", "")
    get_settings.cache_clear()

    with pytest.raises(HTTPException) as exc:
        await require_api_key(request=None, authorization="Bearer not-a-session")

    assert exc.value.status_code == 401
    get_settings.cache_clear()


def test_demo_workspace_ids_are_session_scoped():
    workspace_id = _workspace_id("12345678-1234-1234-1234-abcdefabcdef")

    assert workspace_id.startswith("demo_")
    assert len(workspace_id) <= 25


def test_demo_catalog_has_three_product_missions():
    assert {"vendor_risk", "gtm", "market"} == set(DEMO_MISSIONS)
    assert all(item["entities"] and item["signals"] for item in DEMO_MISSIONS.values())


def test_custom_password_hash_verifies_without_storing_plaintext():
    encoded = hash_password("correct-horse-battery-staple")

    assert "correct-horse" not in encoded
    assert verify_password("correct-horse-battery-staple", encoded)
    assert not verify_password("wrong-password", encoded)


@pytest.mark.asyncio
async def test_custom_auth_accepts_webdataos_session(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "custom")
    monkeypatch.setenv("AUTH_JWT_SECRET", "test-secret-with-at-least-thirty-two-bytes")
    monkeypatch.setenv("API_KEYS", "")
    get_settings.cache_clear()
    token = create_session_token(
        settings=get_settings(),
        user_id="user_123",
        tenant_id="tenant_abc",
        email="analyst@example.com",
        role="admin",
    )

    auth = await require_api_key(request=None, authorization=f"Bearer {token}", x_api_key=None)

    assert auth.auth_type == "session"
    assert auth.tenant_id == "tenant_abc"
    assert auth.user_id == "user_123"
    assert auth.principal == "analyst@example.com"
    get_settings.cache_clear()


def test_clerk_issuer_accepts_config_without_scheme():
    assert _issuer_allowed("https://real-feline-20.clerk.accounts.dev", "real-feline-20.clerk.accounts.dev")
    assert _issuer_allowed("https://real-feline-20.clerk.accounts.dev/", "real-feline-20.clerk.accounts.dev")
    assert not _issuer_allowed("https://other.clerk.accounts.dev", "real-feline-20.clerk.accounts.dev")
