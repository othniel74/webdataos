from __future__ import annotations

import asyncio
import uuid
import hashlib
import hmac
import json
from typing import Any

import httpx

from packages.common.config import get_settings
from packages.common.logging import get_logger
from packages.schemas.partners import WorkflowEvent, WorkflowTriggerRequest

logger = get_logger(__name__)


class TriggerWareService:
    """TriggerWare adapter for event-driven workflow automation."""

    def __init__(self) -> None:
        self.settings = get_settings()

    async def trigger(self, request: WorkflowTriggerRequest) -> WorkflowEvent:
        if self.settings.triggerware_endpoint:
            return await self._trigger_remote(request)

        action = self._action_for(request.event_type, request.severity)
        return WorkflowEvent(
            event_id=request.event_id or f"tw_{uuid.uuid4().hex[:12]}",
            workspace_id=request.workspace_id,
            event_type=request.event_type,
            status="triggered",
            action=request.recommended_action or action,
            severity=request.severity,
            summary=request.summary,
        )

    async def _trigger_remote(self, request: WorkflowTriggerRequest) -> WorkflowEvent:
        payload: dict[str, Any] = {
            "event_id": request.event_id or f"wdo_{uuid.uuid4().hex[:12]}",
            "workspace_id": request.workspace_id,
            "run_id": request.run_id,
            "domain": request.domain or request.package_id or "enterprise",
            "package_id": request.package_id,
            "event_type": request.event_type,
            "signal_type": request.signal_type or request.event_type,
            "entity_id": request.entity_id,
            "entity_name": request.entity_name,
            "summary": request.summary,
            "severity": request.severity,
            "recommended_action": request.recommended_action,
            "action": request.recommended_action,
            "evidence_urls": request.evidence_urls,
            "source_system": request.source_system,
            "payload": request.payload,
        }
        headers = {"Content-Type": "application/json"}
        if self.settings.triggerware_api_key:
            headers["Authorization"] = f"Bearer {self.settings.triggerware_api_key}"
            headers["X-API-Key"] = self.settings.triggerware_api_key
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        if self.settings.triggerware_webhook_secret:
            digest = hmac.new(
                self.settings.triggerware_webhook_secret.encode("utf-8"),
                body,
                hashlib.sha256,
            ).hexdigest()
            headers["X-WebDataOS-Signature"] = f"sha256={digest}"

        _RETRYABLE = {429, 502, 503, 504}
        last_exc: Exception | None = None
        for attempt in range(3):
            if attempt:
                await asyncio.sleep(2 ** attempt)
                logger.warning("triggerware_retry", attempt=attempt, endpoint=self.settings.triggerware_endpoint)
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(
                        self.settings.triggerware_endpoint,
                        headers=headers,
                        content=body,
                    )
                    if response.status_code in _RETRYABLE and attempt < 2:
                        last_exc = httpx.HTTPStatusError(
                            f"status {response.status_code}", request=response.request, response=response
                        )
                        continue
                    response.raise_for_status()
                    data = self._json_or_empty(response)
                    break
            except (httpx.TransportError, httpx.TimeoutException) as exc:
                last_exc = exc
                continue
        else:
            raise last_exc or RuntimeError("TriggerWare delivery failed after 3 attempts")

        event_id = (
            data.get("event_id")
            or data.get("id")
            or data.get("run_id")
            or data.get("execution_id")
            or f"tw_{uuid.uuid4().hex[:12]}"
        )
        status = data.get("status") or data.get("state") or "triggered"
        action = data.get("action") or self._action_for(request.event_type, request.severity)
        action_id = data.get("action_id")
        logger.info("triggerware_remote_triggered", event_id=event_id, status=status)
        return WorkflowEvent(
            event_id=str(event_id),
            workspace_id=request.workspace_id,
            event_type=request.event_type,
            status=str(status),
            action=str(action),
            severity=request.severity,
            summary=request.summary,
            action_id=str(action_id) if action_id else None,
        )

    def _json_or_empty(self, response: httpx.Response) -> dict[str, Any]:
        try:
            data = response.json()
            return data if isinstance(data, dict) else {}
        except ValueError:
            return {}

    def _action_for(self, event_type: str, severity: str) -> str:
        if severity.lower() in {"high", "critical"}:
            return "create_review_task_and_notify_owner"
        if event_type in {"vendor_risk", "compliance_signal", "breach_exposure"}:
            return "create_compliance_review_task"
        return "send_digest_alert"
