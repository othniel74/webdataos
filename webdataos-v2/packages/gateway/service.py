import time
import uuid
from packages.brightdata.client import BrightDataClient
from packages.gateway.failure_detector import FailureDetector
from packages.gateway.normalizer import ResultNormalizer
from packages.gateway.recovery import RecoveryRouter
from packages.observability.metrics import GATEWAY_LATENCY, GATEWAY_RECOVERY_ATTEMPTS, GATEWAY_REQUESTS
from packages.common.config import get_settings
from packages.common.time import utc_iso
from packages.schemas.common import FailureType, ToolName
from packages.schemas.gateway import GatewayFetchRequest, GatewayFetchResponse, RecoveryStep


class GatewayService:
    def __init__(self, client: BrightDataClient | None = None) -> None:
        self.client = client or BrightDataClient()
        self.detector = FailureDetector()
        self.router = RecoveryRouter()
        self.normalizer = ResultNormalizer()
        self.settings = get_settings()

    async def fetch(self, request: GatewayFetchRequest) -> GatewayFetchResponse:
        request_id = str(uuid.uuid4())
        receipt_id = f"gw_{request_id}"
        max_attempts = request.max_attempts or self.settings.max_recovery_attempts
        current_tool = self.router.choose_initial(request.preferred_tool, has_query=bool(request.query and not request.url))
        recovery_path: list[RecoveryStep] = []
        final_data: dict = {}
        final_text: str | None = None
        final_confidence = 0.0
        final_error: str | None = None

        for attempt in range(1, max_attempts + 1):
            start = time.perf_counter()
            try:
                result = await self._execute_tool(current_tool, request)
                failure_type, reason = self.detector.detect(result)
                latency_ms = int((time.perf_counter() - start) * 1000)
                recovery_path.append(
                    RecoveryStep(
                        attempt=attempt,
                        tool=current_tool,
                        status="failed" if failure_type != FailureType.none else "success",
                        failure_type=failure_type,
                        reason=reason,
                        latency_ms=latency_ms,
                    )
                )
                GATEWAY_LATENCY.labels(tool=current_tool.value).observe(latency_ms / 1000)
                if failure_type == FailureType.none:
                    final_data, final_text, final_confidence = self.normalizer.normalize(result, request.output_schema)
                    GATEWAY_REQUESTS.labels(tool=current_tool.value, status="success").inc()
                    return GatewayFetchResponse(
                        status="success",
                        request_id=request_id,
                        receipt_id=receipt_id,
                        source_url=request.url,
                        query=request.query,
                        tool_used=current_tool,
                        recovery_path=recovery_path,
                        data=final_data,
                        raw_text=final_text,
                        confidence=final_confidence,
                        extracted_at=utc_iso(),
                        metadata={"attempts": attempt, "max_attempts": max_attempts},
                    )
                GATEWAY_RECOVERY_ATTEMPTS.labels(failure_type=failure_type.value, tool=current_tool.value).inc()
                next_tool = self.router.next_tool(current_tool, failure_type)
                if not next_tool or next_tool == current_tool:
                    final_error = reason or "Recovery failed"
                    break
                current_tool = next_tool
            except Exception as exc:
                latency_ms = int((time.perf_counter() - start) * 1000)
                recovery_path.append(
                    RecoveryStep(
                        attempt=attempt,
                        tool=current_tool,
                        status="error",
                        failure_type=FailureType.unknown,
                        reason=str(exc),
                        latency_ms=latency_ms,
                    )
                )
                GATEWAY_RECOVERY_ATTEMPTS.labels(failure_type="unknown", tool=current_tool.value).inc()
                next_tool = self.router.next_tool(current_tool, FailureType.unknown)
                if not next_tool:
                    final_error = str(exc)
                    break
                current_tool = next_tool

        GATEWAY_REQUESTS.labels(tool=current_tool.value, status="failed").inc()
        return GatewayFetchResponse(
            status="failed",
            request_id=request_id,
            receipt_id=receipt_id,
            source_url=request.url,
            query=request.query,
            tool_used=current_tool,
            recovery_path=recovery_path,
            data=final_data,
            raw_text=final_text,
            confidence=final_confidence,
            extracted_at=utc_iso(),
            metadata={"attempts": len(recovery_path), "max_attempts": max_attempts},
            error=final_error or "All recovery attempts failed",
        )

    async def _execute_tool(self, tool: ToolName, request: GatewayFetchRequest):
        if tool == ToolName.serp_api:
            results = await self.client.serp_search(request.query or request.url or "", country=request.country)
            return self._serp_as_result(results, request.query or "")
        if not request.url:
            raise ValueError("A URL is required for extraction tools")
        if tool == ToolName.web_scraper_api:
            return await self.client.web_scraper_extract(request.url, request.output_schema)
        if tool == ToolName.scraping_browser:
            return await self.client.scraping_browser_extract(request.url, request.output_schema)
        if tool == ToolName.web_unlocker:
            return await self.client.web_unlocker_fetch(request.url)
        return await self.client.web_scraper_extract(request.url, request.output_schema)

    def _serp_as_result(self, results, query: str):
        from packages.brightdata.models import BrightDataResult
        return BrightDataResult(
            tool=ToolName.serp_api,
            query=query,
            status_code=200,
            json_data={"results": [r.model_dump() for r in results]},
            text="\n".join([f"{r.title}: {r.url}" for r in results]),
        )
