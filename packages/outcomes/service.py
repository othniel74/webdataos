"""Outcome tracking service — records what happened after recommendations
and feeds accuracy data back into retrieval scoring."""
from __future__ import annotations

import uuid
from collections import defaultdict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from apps.api.db.models import Outcome
from packages.schemas.reasoning import OutcomeRead, OutcomeRecord, OutcomeStats


class OutcomeService:

    async def record(self, db: AsyncSession, outcome: OutcomeRecord) -> OutcomeRead:
        model = Outcome(
            id=str(uuid.uuid4()),
            workspace_id=outcome.workspace_id,
            event_id=outcome.event_id,
            action_id=outcome.action_id,
            run_id=outcome.run_id,
            entity_name=outcome.entity_name,
            signal_type=outcome.signal_type,
            outcome_type=outcome.outcome_type,
            outcome_value=outcome.outcome_value,
            feedback_text=outcome.feedback_text,
            recorded_by=outcome.recorded_by,
        )
        db.add(model)
        await db.commit()
        return self._read(model)

    async def list_outcomes(self, db: AsyncSession, workspace_id: str, limit: int = 50) -> list[OutcomeRead]:
        result = await db.execute(
            select(Outcome)
            .where(Outcome.workspace_id == workspace_id)
            .order_by(Outcome.created_at.desc())
            .limit(limit)
        )
        return [self._read(o) for o in result.scalars().all()]

    async def get_stats(self, db: AsyncSession, workspace_id: str) -> OutcomeStats:
        result = await db.execute(
            select(Outcome).where(Outcome.workspace_id == workspace_id)
        )
        outcomes = result.scalars().all()

        counts = defaultdict(int)
        signal_hits = defaultdict(lambda: {"total": 0, "useful": 0})
        entity_hits = defaultdict(lambda: {"total": 0, "useful": 0})

        for o in outcomes:
            counts[o.outcome_type] += 1
            if o.signal_type:
                signal_hits[o.signal_type]["total"] += 1
                if o.outcome_type in {"acted", "confirmed_useful"}:
                    signal_hits[o.signal_type]["useful"] += 1
            if o.entity_name:
                entity_hits[o.entity_name]["total"] += 1
                if o.outcome_type in {"acted", "confirmed_useful"}:
                    entity_hits[o.entity_name]["useful"] += 1

        total = len(outcomes) or 1
        useful = counts.get("acted", 0) + counts.get("confirmed_useful", 0)

        return OutcomeStats(
            workspace_id=workspace_id,
            total_outcomes=len(outcomes),
            acted=counts.get("acted", 0),
            dismissed=counts.get("dismissed", 0),
            false_alarms=counts.get("false_alarm", 0),
            confirmed_useful=counts.get("confirmed_useful", 0),
            hit_rate=round(useful / total, 3),
            signal_accuracy={k: round(v["useful"] / max(v["total"], 1), 3) for k, v in signal_hits.items()},
            entity_accuracy={k: round(v["useful"] / max(v["total"], 1), 3) for k, v in entity_hits.items()},
        )

    def _read(self, model: Outcome) -> OutcomeRead:
        return OutcomeRead(
            id=model.id,
            workspace_id=model.workspace_id,
            event_id=model.event_id,
            action_id=model.action_id,
            run_id=model.run_id,
            entity_name=model.entity_name,
            signal_type=model.signal_type,
            outcome_type=model.outcome_type,
            outcome_value=model.outcome_value or {},
            feedback_text=model.feedback_text,
            recorded_by=model.recorded_by,
            created_at=str(model.created_at) if model.created_at else None,
        )
