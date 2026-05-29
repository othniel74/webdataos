from __future__ import annotations

import uuid
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
            event_id=f"tw_{uuid.uuid4().hex[:12]}",
            workspace_id=request.workspace_id,
            event_type=request.event_type,
            status="triggered",
            action=action,
            severity=request.severity,
            summary=request.summary,
        )

    async def _trigger_remote(self, request: WorkflowTriggerRequest) -> WorkflowEvent:
        payload: dict[str, Any] = {
            "workspace_id": request.workspace_id,
            "event_type": request.event_type,
            "summary": request.summary,
            "severity": request.severity,
            "payload": request.payload,
        }
        headers = {"Content-Type": "application/json"}
        if self.settings.triggerware_api_key:
            headers["Authorization"] = f"Bearer {self.settings.triggerware_api_key}"
            headers["X-API-Key"] = self.settings.triggerware_api_key

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                self.settings.triggerware_endpoint,
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = self._json_or_empty(response)

        event_id = (
            data.get("event_id")
            or data.get("id")
            or data.get("run_id")
            or data.get("execution_id")
            or f"tw_{uuid.uuid4().hex[:12]}"
        )
        status = data.get("status") or data.get("state") or "triggered"
        action = data.get("action") or self._action_for(request.event_type, request.severity)
        logger.info("triggerware_remote_triggered", event_id=event_id, status=status)
        return WorkflowEvent(
            event_id=str(event_id),
            workspace_id=request.workspace_id,
            event_type=request.event_type,
            status=str(status),
            action=str(action),
            severity=request.severity,
            summary=request.summary,
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
