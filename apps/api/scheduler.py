"""Background scheduler — runs workspace monitoring at each topic's configured cadence.

Each Topic stores `next_run_at`. The scheduler wakes every 60 s, finds all topics
whose `next_run_at` has passed, updates the timestamp before dispatching so a second
scheduler instance (if any) won't double-fire, then runs the orchestrator in a
background task. A semaphore caps concurrent runs.
"""
from __future__ import annotations

import asyncio
from datetime import timedelta

from sqlalchemy import select

from apps.api.db.session import AsyncSessionLocal
from apps.api.db.models import Topic
from packages.agents.orchestrator import ResearchAgentOrchestrator
from packages.common.config import get_settings
from packages.common.logging import get_logger
from packages.common.time import utc_now
from packages.enterprise.packs import get_pack, package_id_from_description
from packages.schemas.agent import ResearchRequest

logger = get_logger(__name__)

_MAX_CONCURRENT = 4
_POLL_INTERVAL_SECONDS = 60


async def _run_topic(topic_id: str, topic_name: str, orchestrator: ResearchAgentOrchestrator) -> None:
    try:
        async with AsyncSessionLocal() as db:
            topic = await db.get(Topic, topic_id)
            if not topic:
                return
            package_id = package_id_from_description(topic.description or "")
            pack = get_pack(package_id)
            entities = ", ".join(topic.entities or []) or topic.name
            signals = ", ".join(topic.watch_types or []) or "material external changes"
            task = (
                f"Scheduled monitoring update for {topic.name}. "
                f"Watch entities: {entities}. Signals: {signals}. "
                f"Use the {pack.name} framework. "
                "Return what changed, why it matters, evidence, recommended actions, and a concise executive update."
            )
            await orchestrator.run(
                db,
                ResearchRequest(
                    task=task,
                    topic_id=topic.id,
                    workspace_id=topic.id,
                    package_id=package_id,
                    input_mode="scheduled",
                    max_sources=8,
                    enable_memory=True,
                    enable_workflows=True,
                ),
            )
            logger.info("scheduler_run_complete", topic_id=topic_id)
    except Exception as exc:
        logger.error("scheduler_run_failed", topic_id=topic_id, error=str(exc)[:300])


async def monitoring_loop(orchestrator: ResearchAgentOrchestrator) -> None:
    """Long-running background task. Starts with the FastAPI lifespan."""
    settings = get_settings()
    semaphore = asyncio.Semaphore(_MAX_CONCURRENT)
    logger.info("scheduler_started", poll_interval_seconds=_POLL_INTERVAL_SECONDS)

    while True:
        await asyncio.sleep(_POLL_INTERVAL_SECONDS)
        try:
            now = utc_now()
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(Topic).where(
                        Topic.refresh_frequency_minutes > 0,
                        Topic.next_run_at <= now,
                        Topic.next_run_at.is_not(None),
                        Topic.tenant_id != settings.demo_tenant_id,
                    )
                )
                due = result.scalars().all()

                if not due:
                    continue

                # Advance next_run_at per-topic before closing session — prevents
                # duplicate dispatch on concurrent scheduler instances (rolling deploy)
                to_dispatch = []
                for t in due:
                    t.next_run_at = now + timedelta(minutes=t.refresh_frequency_minutes)
                    to_dispatch.append(t.id)
                await db.commit()

            logger.info("scheduler_dispatching", count=len(to_dispatch))
            for topic_id in to_dispatch:
                async def _dispatch(tid=topic_id):
                    async with semaphore:
                        await _run_topic(tid, tid, orchestrator)
                asyncio.create_task(_dispatch())

        except Exception as exc:
            logger.error("scheduler_poll_error", error=str(exc)[:300])
