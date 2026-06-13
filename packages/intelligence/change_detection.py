"""
Gap 2: Change detection — compare current run against previous run for the same workspace.
Surfaces what is genuinely new vs what was already known, so every brief leads with a delta.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from packages.common.logging import get_logger

logger = get_logger(__name__)


@dataclass
class ChangeReport:
    new_signals: list[str] = field(default_factory=list)
    resolved_signals: list[str] = field(default_factory=list)
    risk_posture_change: str | None = None
    new_entities: list[str] = field(default_factory=list)
    confidence_delta: float = 0.0
    run_ids: tuple[str, str] = ("", "")
    days_since_last_run: float | None = None

    def has_changes(self) -> bool:
        return bool(
            self.new_signals
            or self.resolved_signals
            or self.risk_posture_change
            or self.new_entities
        )

    def delta_headline(self) -> str:
        parts = []
        if self.new_signals:
            parts.append(f"+{len(self.new_signals)} new signal{'s' if len(self.new_signals) != 1 else ''}")
        if self.resolved_signals:
            parts.append(f"{len(self.resolved_signals)} resolved")
        if self.risk_posture_change:
            parts.append(f"Risk: {self.risk_posture_change}")
        if self.new_entities:
            parts.append(f"{len(self.new_entities)} new {'entities' if len(self.new_entities) != 1 else 'entity'}")
        if not parts:
            return "No changes since last run"
        age = ""
        if self.days_since_last_run is not None:
            d = round(self.days_since_last_run)
            age = f" (vs {d} day{'s' if d != 1 else ''} ago)" if d > 0 else " (vs earlier today)"
        return "  |  ".join(parts) + age

    def to_dict(self) -> dict:
        return {
            "new_signals": self.new_signals,
            "resolved_signals": self.resolved_signals,
            "risk_posture_change": self.risk_posture_change,
            "new_entities": self.new_entities,
            "confidence_delta": self.confidence_delta,
            "run_ids": list(self.run_ids),
            "days_since_last_run": self.days_since_last_run,
            "delta_headline": self.delta_headline(),
            "has_changes": self.has_changes(),
        }


class ChangeDetectionService:
    """Compare the current reasoning output against the previous agent run for the same workspace."""

    def compare(
        self,
        current_run_id: str,
        previous_report: dict[str, Any],
        current_reasoning: Any,
        current_records: list[Any],
        previous_run_id: str = "",
        days_since: float | None = None,
    ) -> ChangeReport:
        try:
            return self._compare(
                current_run_id=current_run_id,
                previous_report=previous_report,
                current_reasoning=current_reasoning,
                current_records=current_records,
                previous_run_id=previous_run_id,
                days_since=days_since,
            )
        except Exception as exc:
            logger.warning("change_detection_failed", error=str(exc)[:200])
            return ChangeReport(run_ids=(previous_run_id, current_run_id), days_since_last_run=days_since)

    def _compare(
        self,
        current_run_id: str,
        previous_report: dict[str, Any],
        current_reasoning: Any,
        current_records: list[Any],
        previous_run_id: str,
        days_since: float | None,
    ) -> ChangeReport:
        prev_reasoning = previous_report.get("reasoning") or {}
        prev_assessments = prev_reasoning.get("materiality_assessments") or []
        prev_risk = prev_reasoning.get("risk_posture") or "stable"
        prev_confidence = previous_report.get("confidence") or 0.0

        curr_assessments = []
        curr_risk = "stable"
        curr_confidence = 0.0
        curr_entities: list[str] = []

        if current_reasoning:
            curr_assessments = current_reasoning.materiality_assessments or []
            curr_risk = current_reasoning.risk_posture or "stable"
            curr_confidence = current_reasoning.confidence or 0.0

        for rec in current_records:
            name = getattr(rec, "entity_name", None)
            if name:
                curr_entities.append(name)

        prev_findings = {
            self._normalize_finding(a.get("finding", ""))
            for a in prev_assessments
            if a.get("finding")
        }
        curr_findings = {
            self._normalize_finding(a.finding)
            for a in curr_assessments
            if getattr(a, "finding", None)
        }

        new_signals = [
            a.finding for a in curr_assessments
            if self._normalize_finding(getattr(a, "finding", "")) not in prev_findings
            and getattr(a, "finding", "")
        ]
        resolved_signals = [
            a.get("finding", "") for a in prev_assessments
            if self._normalize_finding(a.get("finding", "")) not in curr_findings
            and a.get("finding")
        ]

        prev_entities_raw = previous_report.get("companies") or []
        prev_entity_names = {(c.get("name") or "").lower() for c in prev_entities_raw if isinstance(c, dict)}
        new_entities = [
            e for e in curr_entities
            if e.lower() not in prev_entity_names
        ]

        risk_posture_change = None
        if curr_risk != prev_risk:
            risk_posture_change = f"{prev_risk} → {curr_risk}"

        confidence_delta = round(curr_confidence - prev_confidence, 3)

        return ChangeReport(
            new_signals=new_signals[:10],
            resolved_signals=resolved_signals[:10],
            risk_posture_change=risk_posture_change,
            new_entities=list(dict.fromkeys(new_entities))[:10],
            confidence_delta=confidence_delta,
            run_ids=(previous_run_id, current_run_id),
            days_since_last_run=days_since,
        )

    @staticmethod
    def _normalize_finding(finding: str) -> str:
        return " ".join(finding.lower().split())[:80]
