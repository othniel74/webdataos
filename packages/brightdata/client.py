"""Bright Data client — production-ready adapter matching actual API patterns.

Endpoints (from Bright Data account):
    SERP API:         POST https://api.brightdata.com/request  (zone: serp_api1)
    Web Unlocker:     POST https://api.brightdata.com/request  (zone: web_unlocker2)
    Web Scraper API:  POST https://api.brightdata.com/datasets/v3/trigger
    Scraping Browser: wss://USER:PASS@brd.superproxy.io:9222  (WebSocket/CDP)
    MCP Server:       GET/stream endpoint from Bright Data MCP

Auth: Bearer API key for HTTP endpoints. Embedded credentials for WebSocket.
"""
import asyncio
import json
from typing import Any, Callable, Awaitable

import httpx

from packages.common.circuit_breaker import CircuitOpenError, InMemoryCircuitBreaker
from packages.common.config import get_settings
from packages.common.errors import BrightDataError
from packages.common.logging import get_logger
from packages.schemas.common import ToolName
from packages.brightdata.models import BrightDataResult, SearchResult

logger = get_logger(__name__)


class BrightDataClient:
    """Production adapter for Bright Data API.

    Uses the unified https://api.brightdata.com/request endpoint with zone-based
    routing for SERP API and Web Unlocker. Uses the datasets trigger endpoint
    for Web Scraper API. Falls back to mock mode when no API key is set.
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
        headers = {"Content-Type": "application/json", "User-Agent": "webdataos/3.0.0"}
        if self.settings.brightdata_api_key:
            headers["Authorization"] = f"Bearer {self.settings.brightdata_api_key}"
        return headers

    # ── SERP API ──────────────────────────────────────────────────────
    # POST https://api.brightdata.com/request
    # Body: {"zone": "serp_api1", "url": "https://www.google.com/search?q=...", "format": "json"}

    async def serp_search(self, query: str, country: str | None = None) -> list[SearchResult]:
        if self.mock:
            return self._mock_serp(query)

        endpoint = self.settings.brightdata_serp_endpoint or self.settings.brightdata_api_endpoint
        zone = self.settings.brightdata_serp_zone

        # Build Google search URL with query
        search_url = f"https://www.google.com/search?q={query.replace(' ', '+')}"
        if country:
            search_url += f"&gl={country}"

        payload = {
            "zone": zone,
            "url": search_url,
            "format": "json",
            "method": "GET",
            "country": country or self.settings.default_country,
        }

        logger.info("brightdata_serp", zone=zone, query=query[:50])

        try:
            data = await self._post_json(endpoint, payload, "serp_api")
        except BrightDataError as exc:
            logger.warning("brightdata_serp_failed", error=str(exc)[:300])
            raise

        data = self._unwrap_brightdata_body(data)

        # Parse SERP results
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

    def _unwrap_brightdata_body(self, data: Any) -> Any:
        """Bright Data /request may wrap parsed SERP JSON inside a string body."""
        if not isinstance(data, dict) or "body" not in data:
            return data
        body = data.get("body")
        if isinstance(body, dict) or isinstance(body, list):
            return body
        if isinstance(body, str):
            try:
                return json.loads(body)
            except ValueError:
                return data
        return data

    # ── Web Unlocker ──────────────────────────────────────────────────
    # POST https://api.brightdata.com/request
    # Body: {"zone": "web_unlocker2", "url": "https://example.com", "format": "raw"}

    async def web_unlocker_fetch(self, url: str) -> BrightDataResult:
        if self.mock:
            return await self._mock_extract(url, ToolName.web_unlocker, None)

        endpoint = self.settings.brightdata_web_unlocker_endpoint or self.settings.brightdata_api_endpoint
        zone = self.settings.brightdata_web_unlocker_zone

        payload = {
            "zone": zone,
            "url": url,
            "format": "raw",
        }

        logger.info("brightdata_web_unlocker", zone=zone, url=url[:80])

        return await self._post_tool(endpoint, ToolName.web_unlocker, payload, url=url)

    # ── Web Scraper API ───────────────────────────────────────────────
    # POST https://api.brightdata.com/datasets/v3/trigger?dataset_id=...&format=json
    # Body: [{"url": "https://example.com"}]

    async def web_scraper_extract(self, url: str, schema: dict[str, Any] | None = None) -> BrightDataResult:
        if self.mock:
            return await self._mock_extract(url, ToolName.web_scraper_api, schema)

        endpoint = self.settings.brightdata_web_scraper_endpoint or self.settings.brightdata_scraper_endpoint

        # Web Scraper API uses a different payload format
        payload = [{"url": url}]

        logger.info("brightdata_web_scraper", url=url[:80])

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await self._with_resilience(
                    "web_scraper_api",
                    lambda: client.post(endpoint, headers=self.headers, json=payload),
                )
        except CircuitOpenError as exc:
            raise BrightDataError(str(exc)) from exc
        except httpx.TimeoutException:
            return BrightDataResult(tool=ToolName.web_scraper_api, url=url, status_code=504, text="timeout")
        except httpx.HTTPError as exc:
            return BrightDataResult(tool=ToolName.web_scraper_api, url=url, status_code=502, text=str(exc))

        json_data = None
        try:
            json_data = resp.json()
        except Exception:
            pass

        return BrightDataResult(
            tool=ToolName.web_scraper_api, url=url,
            status_code=resp.status_code, text=resp.text,
            json_data=json_data, metadata={"endpoint": endpoint},
        )

    # ── Scraping Browser ──────────────────────────────────────────────
    # wss://USER:PASS@brd.superproxy.io:9222 (WebSocket/CDP)
    # For now: falls back to web_unlocker as the browser requires
    # Puppeteer/Playwright which isn't in the API server process.

    async def scraping_browser_extract(self, url: str, schema: dict[str, Any] | None = None) -> BrightDataResult:
        if self.mock:
            return await self._mock_extract(url, ToolName.scraping_browser, schema)

        selenium_endpoint = self._selenium_endpoint()
        if selenium_endpoint:
            logger.info("brightdata_scraping_browser_selenium", url=url[:80])
            try:
                return await asyncio.to_thread(self._selenium_fetch, selenium_endpoint, url)
            except Exception as exc:
                logger.warning("brightdata_scraping_browser_failed", error=str(exc), url=url[:80])

        logger.info("brightdata_scraping_browser_via_unlocker", url=url[:80])
        result = await self.web_unlocker_fetch(url)
        result.tool = ToolName.scraping_browser
        return result

    def _selenium_endpoint(self) -> str | None:
        if self.settings.brightdata_selenium_endpoint:
            return self.settings.brightdata_selenium_endpoint
        if self.settings.brightdata_browser_user and self.settings.brightdata_browser_password:
            return (
                "https://"
                f"{self.settings.brightdata_browser_user}:{self.settings.brightdata_browser_password}"
                "@brd.superproxy.io:9515"
            )
        return None

    def _selenium_fetch(self, endpoint: str, url: str) -> BrightDataResult:
        from selenium import webdriver
        from selenium.webdriver import ChromeOptions

        options = ChromeOptions()
        options.add_argument("--disable-dev-shm-usage")
        driver = webdriver.Remote(command_executor=endpoint, options=options)
        try:
            driver.set_page_load_timeout(self.timeout)
            driver.get(url)
            return BrightDataResult(
                tool=ToolName.scraping_browser,
                url=url,
                status_code=200,
                text=driver.page_source,
                metadata={"title": driver.title, "endpoint": "brightdata_selenium"},
            )
        finally:
            driver.quit()

    # ── Bright Data MCP ───────────────────────────────────────────────
    # Optional final fallback. Bright Data MCP is typically an SSE endpoint;
    # the API server treats it as a best-effort fetch boundary.

    async def mcp_server_extract(self, url: str, schema: dict[str, Any] | None = None) -> BrightDataResult:
        if self.mock:
            return await self._mock_extract(url, ToolName.mcp_server, schema)
        if not self.settings.brightdata_mcp_endpoint:
            return BrightDataResult(
                tool=ToolName.mcp_server,
                url=url,
                status_code=501,
                text="Bright Data MCP endpoint is not configured",
            )
        return await self._get_tool(self.settings.brightdata_mcp_endpoint, ToolName.mcp_server, url=url)

    # ── Internal helpers ──────────────────────────────────────────────

    async def _get_tool(self, endpoint: str, tool: ToolName, url: str | None) -> BrightDataResult:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await self._with_resilience(tool.value, lambda: client.get(endpoint, headers=self.headers))
        except CircuitOpenError as exc:
            raise BrightDataError(str(exc)) from exc
        except httpx.TimeoutException:
            return BrightDataResult(tool=tool, url=url, status_code=504, text="timeout", metadata={"endpoint": endpoint})
        except httpx.HTTPError as exc:
            return BrightDataResult(tool=tool, url=url, status_code=502, text=str(exc), metadata={"endpoint": endpoint})

        json_data = None
        try:
            json_data = resp.json()
        except Exception:
            pass
        return BrightDataResult(tool=tool, url=url, status_code=resp.status_code, text=resp.text, json_data=json_data, metadata={"endpoint": endpoint})

    async def _post_tool(self, endpoint: str, tool: ToolName, payload: dict[str, Any], url: str | None) -> BrightDataResult:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await self._with_resilience(tool.value, lambda: client.post(endpoint, headers=self.headers, json=payload))
        except CircuitOpenError as exc:
            raise BrightDataError(str(exc)) from exc
        except httpx.TimeoutException:
            return BrightDataResult(tool=tool, url=url, status_code=504, text="timeout", metadata={"endpoint": endpoint})
        except httpx.HTTPError as exc:
            return BrightDataResult(tool=tool, url=url, status_code=502, text=str(exc), metadata={"endpoint": endpoint})

        text = resp.text
        json_data = None
        try:
            json_data = resp.json()
        except Exception:
            pass

        return BrightDataResult(tool=tool, url=url, status_code=resp.status_code, text=text, json_data=json_data, metadata={"endpoint": endpoint, "zone": payload.get("zone")})

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

    # ── Mock mode ─────────────────────────────────────────────────────

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
            "company": "Example AI", "pricing_model": "usage-based", "starting_price": "$49/month",
            "features": ["agent monitoring", "trace analysis", "workflow analytics"],
            "target_customers": ["developers", "enterprise AI teams"],
            "positioning": "Infrastructure for reliable agent workflows",
        }
        if schema:
            data = {k: data.get(k, None) for k in schema.keys()} | {k: v for k, v in data.items() if k not in schema}
        return BrightDataResult(
            tool=tool, url=url, status_code=200,
            text="Example AI offers usage-based pricing for agent monitoring.",
            json_data=data, metadata={"mock": True},
        )
