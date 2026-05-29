import pytest
from packages.gateway.service import GatewayService
from packages.schemas.gateway import GatewayFetchRequest
from packages.schemas.common import ToolName


@pytest.mark.asyncio
async def test_gateway_returns_receipt_and_metadata():
    service = GatewayService()
    resp = await service.fetch(GatewayFetchRequest(url="https://example.com/dynamic/pricing", preferred_tool=ToolName.web_scraper_api))
    assert resp.request_id
    assert resp.receipt_id and resp.receipt_id.startswith("gw_")
    assert "attempts" in resp.metadata
    assert resp.recovery_path


@pytest.mark.asyncio
async def test_serp_path_does_not_require_url():
    service = GatewayService()
    resp = await service.fetch(GatewayFetchRequest(query="AI agent infrastructure", preferred_tool=ToolName.serp_api))
    assert resp.status == "success"
    assert "results" in resp.data
