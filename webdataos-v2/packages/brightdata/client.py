import asyncio
from typing import Any, Callable, Awaitable
from urllib.parse import quote_plus

import httpx
from packages.common.circuit_breaker import CircuitOpenError, InMemoryCircuitBreaker
from packages.common.config import get_settings
from packages.common.errors import BrightDataError
from packages.schemas.common import ToolName
from packages.brightdata.models import BrightDataResult, SearchResult


class BrightDataClient:
    """Production-ready adapter boundary for Bright Data products.

    The class keeps mock mode available for local demos while providing retries, timeouts,
    upstream error shaping, and a lightweight circuit breaker for real Bright Data calls.
    """

    _breaker: InMemoryCircuitBreaker | None = None

    def __init__(self) -> None:
        self.settings = get_settings()
        self.timeout = self.settings.request_timeout_seconds
        self.mock = self.settings.mock_brightdata or not self.settings.brightdata_api_key
        if BrightDataClient._breaker is None:
            BrightDataClient._breaker = InMemoryCircuitBreaker(
                failure_threshold=self.settings.circuit_breaker_failure_threshold,
                reset_seconds=self.settings.circuit_breaker_reset_seconds,
            )
        self.breaker = BrightDataClient._breaker

    @property
    def headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json", "User-Agent": "web-data-unlocked/0.2.0"}
        if self.settings.brightdata_api_key:
            headers["Authorization"] = f"Bearer {self.settings.brightdata_api_key}"
        return headers

    async def serp_search(self, query: str, country: str | None = None) -> list[SearchResult]:
        if self.mock or not self.settings.brightdata_serp_endpoint:
            return self._mock_serp(query)
        base_url = f"https://www.google.com/search?q={quote_plus(query)}"
        search_url = f"{base_url}&brd_json=1"
        payload = {
            "zone": "serp_api1",
            "url": search_url,
            "format": "raw",
        }
        data = await self._post_json(self.settings.brightdata_serp_endpoint, payload, "serp_api")
        items = data.get("organic", data.get("results", data if isinstance(data, list) else []))
        return [
            SearchResult(
                title=item.get("title", "Untitled"),
                url=item.get("url") or item.get("link"),
                snippet=item.get("snippet") or item.get("description"),
                rank=i + 1,
            )
            for i, item in enumerate(items)
            if item.get("url") or item.get("link")
        ]

    async def web_scraper_extract(self, url: str, schema: dict[str, Any] | None = None) -> BrightDataResult:
        if self.mock or not self.settings.brightdata_web_scraper_endpoint:
            return await self._mock_extract(url, ToolName.web_scraper_api, schema)
        return await self._post_tool(
            self.settings.brightdata_web_scraper_endpoint,
            ToolName.web_scraper_api,
            {"url": url, "schema": schema or {}},
            url=url,
        )

    async def web_unlocker_fetch(self, url: str) -> BrightDataResult:
        if self.mock or not self.settings.brightdata_web_unlocker_endpoint:
            return await self._mock_extract(url, ToolName.web_unlocker, None)
        return await self._post_tool(
            self.settings.brightdata_web_unlocker_endpoint,
            ToolName.web_unlocker,
            {"zone": "unlocker", "url": url, "format": "raw", "data_format": "html"},
            url=url,
        )

    async def scraping_browser_extract(self, url: str, schema: dict[str, Any] | None = None) -> BrightDataResult:
        if self.mock or not self.settings.brightdata_scraping_browser_endpoint:
            return await self._mock_extract(url, ToolName.scraping_browser, schema)
        endpoint = self.settings.brightdata_scraping_browser_endpoint
        if endpoint.startswith("wss://"):
            raise BrightDataError(
                "Bright Data Browser API is a WebSocket endpoint and requires browser automation support; this app cannot POST to wss:// URLs yet."
            )
        return await self._post_tool(
            endpoint,
            ToolName.scraping_browser,
            {"url": url, "schema": schema or {}},
            url=url,
        )

    async def mcp_server_extract(self, url: str, schema: dict[str, Any] | None = None) -> BrightDataResult:
        if self.mock or not self.settings.brightdata_mcp_endpoint:
            return await self._mock_extract(url, ToolName.mcp_server, schema)
        return await self._get_tool(
            self.settings.brightdata_mcp_endpoint,
            ToolName.mcp_server,
            url=url,
        )

    async def _get_tool(self, endpoint: str, tool: ToolName, url: str | None) -> BrightDataResult:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await self._with_resilience(tool.value, lambda: client.get(endpoint, headers=self.headers))
        except CircuitOpenError as exc:
            raise BrightDataError(str(exc)) from exc
        except httpx.TimeoutException as exc:
            return BrightDataResult(tool=tool, url=url, status_code=504, text="timeout", metadata={"endpoint": endpoint})
        except httpx.HTTPError as exc:
            return BrightDataResult(tool=tool, url=url, status_code=502, text=str(exc), metadata={"endpoint": endpoint})
        text = resp.text
        json_data = None
        try:
            json_data = resp.json()
        except Exception:
            pass
        return BrightDataResult(tool=tool, url=url, status_code=resp.status_code, text=text, json_data=json_data, metadata={"endpoint": endpoint})

    async def _post_tool(self, endpoint: str, tool: ToolName, payload: dict[str, Any], url: str | None) -> BrightDataResult:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await self._with_resilience(tool.value, lambda: client.post(endpoint, headers=self.headers, json=payload))
        except CircuitOpenError as exc:
            raise BrightDataError(str(exc)) from exc
        except httpx.TimeoutException as exc:
            return BrightDataResult(tool=tool, url=url, status_code=504, text="timeout", metadata={"endpoint": endpoint})
        except httpx.HTTPError as exc:
            return BrightDataResult(tool=tool, url=url, status_code=502, text=str(exc), metadata={"endpoint": endpoint})
        text = resp.text
        json_data = None
        try:
            json_data = resp.json()
        except Exception:
            pass
        return BrightDataResult(tool=tool, url=url, status_code=resp.status_code, text=text, json_data=json_data, metadata={"endpoint": endpoint})

    async def _post_json(self, endpoint: str, payload: dict[str, Any], circuit_name: str) -> Any:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await self._with_resilience(circuit_name, lambda: client.post(endpoint, headers=self.headers, json=payload))
        except CircuitOpenError as exc:
            raise BrightDataError(str(exc)) from exc
        except httpx.TimeoutException as exc:
            raise BrightDataError("Bright Data request timed out") from exc
        except httpx.HTTPError as exc:
            raise BrightDataError(f"Bright Data request failed: {exc}") from exc
        if resp.status_code >= 400:
            raise BrightDataError(f"Bright Data {circuit_name} failed: {resp.status_code} {resp.text[:300]}")
        try:
            return resp.json()
        except ValueError as exc:
            raise BrightDataError("Bright Data returned non-JSON response") from exc

    async def _with_resilience(self, circuit_name: str, fn: Callable[[], Awaitable[httpx.Response]]) -> httpx.Response:
        if self.settings.circuit_breaker_enabled and self.breaker:
            self.breaker.before_call(circuit_name)
        try:
            response = await self._retrying_call(fn)
            if response.status_code >= 500 and self.settings.circuit_breaker_enabled and self.breaker:
                self.breaker.record_failure(circuit_name)
            elif self.settings.circuit_breaker_enabled and self.breaker:
                self.breaker.record_success(circuit_name)
            return response
        except Exception:
            if self.settings.circuit_breaker_enabled and self.breaker:
                self.breaker.record_failure(circuit_name)
            raise

    async def _retrying_call(self, fn: Callable[[], Awaitable[httpx.Response]]) -> httpx.Response:
        last_exc: Exception | None = None
        attempts = max(1, self.settings.retry_attempts)
        for attempt in range(1, attempts + 1):
            try:
                return await fn()
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_exc = exc
                if attempt >= attempts:
                    break
                delay = min(
                    self.settings.retry_backoff_max_seconds,
                    self.settings.retry_backoff_min_seconds * (2 ** (attempt - 1)),
                )
                await asyncio.sleep(delay)
        assert last_exc is not None
        raise last_exc

    def _mock_serp(self, query: str) -> list[SearchResult]:
        base = "https://example.com"
        safe = query.lower().replace(" ", "-")[:60] or "web-intelligence"
        return [
            SearchResult(title="Example AI Pricing", url=f"{base}/{safe}/pricing", snippet="Pricing and packaging page", rank=1),
            SearchResult(title="Example AI Docs", url=f"{base}/{safe}/docs", snippet="Product documentation and features", rank=2),
            SearchResult(title="Market News: Agent Infrastructure", url=f"{base}/{safe}/news", snippet="Recent launch and market update", rank=3),
            SearchResult(title="Competitor Platform Overview", url=f"{base}/{safe}/platform", snippet="Company positioning and target users", rank=4),
        ]

    async def _mock_extract(self, url: str, tool: ToolName, schema: dict[str, Any] | None) -> BrightDataResult:
        await asyncio.sleep(0.05)
        if "blocked" in url and tool == ToolName.web_scraper_api:
            return BrightDataResult(tool=tool, url=url, status_code=403, text="Access denied / captcha")
        if "dynamic" in url and tool == ToolName.web_scraper_api:
            return BrightDataResult(tool=tool, url=url, status_code=200, text="", json_data={})
        data = {
            "company": "Example AI",
            "pricing_model": "usage-based",
            "starting_price": "$49/month",
            "features": ["agent monitoring", "trace analysis", "workflow analytics"],
            "target_customers": ["developers", "enterprise AI teams"],
            "positioning": "Infrastructure for reliable agent workflows",
        }
        if schema:
            data = {k: data.get(k, None) for k in schema.keys()} | {k: v for k, v in data.items() if k not in schema}
        return BrightDataResult(
            tool=tool,
            url=url,
            status_code=200,
            text="Example AI offers usage-based pricing for agent monitoring, trace analysis, and workflow analytics.",
            json_data=data,
            metadata={"mock": True},
        )
