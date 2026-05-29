import pytest
from packages.common.config import get_settings


@pytest.fixture(autouse=True)
def clear_settings_cache():
    """Ensure every test starts with a fresh settings cache.

    Tests that monkeypatch env vars call get_settings.cache_clear() themselves,
    but if they fail mid-test the cached value can bleed into the next test.
    This fixture clears the cache both before and after every test.
    """
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
