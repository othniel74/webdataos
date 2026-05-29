import pytest
from packages.gateway.service import GatewayService
from packages.schemas.gateway import GatewayFetchRequest
from packages.schemas.common import ToolName


@pytest.mark.asyncio
async def test_gateway_mock_fetch_success():
    service = GatewayService()
    resp = await service.fetch(GatewayFetchRequest(url="https://example.com/pricing", preferred_tool=ToolName.web_scraper_api))
    assert resp.status == "success"
    assert resp.data
    assert resp.recovery_path


@pytest.mark.asyncio
async def test_gateway_recovers_blocked_page():
    service = GatewayService()
    resp = await service.fetch(GatewayFetchRequest(url="https://example.com/blocked/pricing", preferred_tool=ToolName.web_scraper_api))
    assert resp.recovery_path[0].status == "failed"
    assert resp.status in {"success", "failed"}
