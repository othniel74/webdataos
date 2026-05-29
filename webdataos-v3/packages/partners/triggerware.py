from __future__ import annotations

import uuid
from packages.schemas.partners import WorkflowEvent, WorkflowTriggerRequest


class TriggerWareService:
    """TriggerWare adapter for event-driven workflow automation."""

    async def trigger(self, request: WorkflowTriggerRequest) -> WorkflowEvent:
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

    def _action_for(self, event_type: str, severity: str) -> str:
        if severity.lower() in {"high", "critical"}:
            return "create_review_task_and_notify_owner"
        if event_type in {"vendor_risk", "compliance_signal", "breach_exposure"}:
            return "create_compliance_review_task"
        return "send_digest_alert"
