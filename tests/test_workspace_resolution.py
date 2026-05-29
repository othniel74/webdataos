from apps.api.workspace_resolution import workspace_id_for_tenant
from packages.common.config import get_settings
from packages.common.security import AuthContext


def _auth(tenant_id: str) -> AuthContext:
    return AuthContext(
        principal="test",
        key_fingerprint="test",
        auth_enabled=True,
        tenant_id=tenant_id,
        auth_type="session",
    )


def test_workspace_id_for_tenant_scopes_customer_default_workspace(monkeypatch):
    monkeypatch.setenv("DEFAULT_TENANT_ID", "tenant_internal")
    get_settings.cache_clear()

    assert workspace_id_for_tenant("workspace_enterprise", _auth("tenant_acme")) == "tenant_acme_workspace_enterprise"

    get_settings.cache_clear()


def test_workspace_id_for_tenant_keeps_internal_seed_workspace(monkeypatch):
    monkeypatch.setenv("DEFAULT_TENANT_ID", "tenant_internal")
    get_settings.cache_clear()

    assert workspace_id_for_tenant("workspace_enterprise", _auth("tenant_internal")) == "workspace_enterprise"

    get_settings.cache_clear()


def test_workspace_id_for_tenant_does_not_double_prefix(monkeypatch):
    monkeypatch.setenv("DEFAULT_TENANT_ID", "tenant_internal")
    get_settings.cache_clear()

    assert (
        workspace_id_for_tenant("tenant_acme_workspace_enterprise", _auth("tenant_acme"))
        == "tenant_acme_workspace_enterprise"
    )

    get_settings.cache_clear()
