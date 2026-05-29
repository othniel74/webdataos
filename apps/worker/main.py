import asyncio
from datetime import UTC, datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import desc, select
from apps.api.db.session import AsyncSessionLocal
from apps.api.db.models import AgentRun, Topic
from packages.common.config import get_settings
from packages.common.logging import configure_logging, get_logger
from packages.agents.orchestrator import ResearchAgentOrchestrator
from packages.enterprise.packs import get_pack, package_id_from_description
from packages.schemas.agent import ResearchRequest

configure_logging()
logger = get_logger(__name__)
settings = get_settings()
agent = ResearchAgentOrchestrator()


def _as_utc(value: datetime | None) -> datetime | None:
    if not value:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


async def _latest_agent_run(db, topic_id: str) -> AgentRun | None:
    result = await db.execute(
        select(AgentRun)
        .where(AgentRun.topic_id == topic_id)
        .order_by(desc(AgentRun.created_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


def _monitoring_task(topic: Topic) -> str:
    entities = ", ".join(topic.entities or []) or topic.name
    signals = ", ".join(topic.watch_types or []) or "material external changes"
    pack = get_pack(package_id_from_description(topic.description))
    return (
        f"Scheduled {pack.name} monitoring update for {topic.name}. "
        f"Watch entities: {entities}. "
        f"Signals: {signals}. "
        f"Use the {pack.name} framework. "
        "Report what changed since the last run, why it matters, the evidence used, "
        "recommended actions, and a concise executive update."
    )


async def refresh_due_topics() -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Topic))
        topics = result.scalars().all()
        now = datetime.now(UTC)
        for topic in topics:
            latest_run = await _latest_agent_run(db, topic.id)
            latest_run_at = _as_utc(latest_run.created_at) if latest_run else None
            due_at = latest_run_at + timedelta(minutes=topic.refresh_frequency_minutes) if latest_run_at else now
            if due_at > now:
                logger.info("monitoring_topic_not_due", topic_id=topic.id, next_due_at=due_at.isoformat())
                continue

            logger.info("monitoring_topic_due", topic_id=topic.id, latest_run_at=latest_run_at.isoformat() if latest_run_at else None)
            try:
                await agent.run(
                    db,
                    ResearchRequest(
                        task=_monitoring_task(topic),
                        topic_id=topic.id,
                        workspace_id=topic.id,
                        package_id=package_id_from_description(topic.description),
                        input_mode="text",
                        max_sources=8,
                        enable_memory=True,
                        enable_workflows=True,
                    ),
                )
            except Exception as exc:
                await db.rollback()
                logger.exception("monitoring_topic_failed", topic_id=topic.id, error=str(exc))


async def main() -> None:
    scheduler = AsyncIOScheduler()
    scheduler.add_job(refresh_due_topics, "interval", minutes=settings.refresh_interval_minutes)
    scheduler.start()
    logger.info("worker_started", interval_minutes=settings.refresh_interval_minutes)
    await refresh_due_topics()
    while True:
        await asyncio.sleep(3600)


if __name__ == "__main__":
    asyncio.run(main())
