import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select
from apps.api.db.session import AsyncSessionLocal
from apps.api.db.models import Topic
from packages.common.config import get_settings
from packages.common.logging import configure_logging, get_logger
from packages.intelligence.service import IntelligenceService

configure_logging()
logger = get_logger(__name__)
settings = get_settings()
service = IntelligenceService()


async def refresh_due_topics() -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Topic))
        topics = result.scalars().all()
        for topic in topics:
            logger.info("refreshing_topic", topic_id=topic.id)
            await service.refresh_topic(db, topic.id, max_sources=8)


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
