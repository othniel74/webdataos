import asyncio
from apps.api.db.session import AsyncSessionLocal
from packages.agents.orchestrator import ResearchAgentOrchestrator
from packages.schemas.agent import ResearchRequest


async def main():
    async with AsyncSessionLocal() as db:
        agent = ResearchAgentOrchestrator()
        report = await agent.run(
            db,
            ResearchRequest(
                task="Research AI agent infrastructure companies and compare pricing, positioning, and recent updates.",
                topic_id="ai_agent_infrastructure",
            ),
        )
        print(report.model_dump_json(indent=2))


if __name__ == "__main__":
    asyncio.run(main())
