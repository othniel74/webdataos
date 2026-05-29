from packages.schemas.agent import ResearchPlanStep


class ResearchPlanner:
    def plan(self, task: str) -> list[ResearchPlanStep]:
        return [
            ResearchPlanStep(step=1, action="Understand task intent", purpose="Identify entities, data types, and freshness needs"),
            ResearchPlanStep(step=2, action="Check existing intelligence", purpose="Use context-aware retrieval before new scraping"),
            ResearchPlanStep(step=3, action="Discover live sources", purpose="Use SERP API to find fresh public web sources", tool_hint="SERP API"),
            ResearchPlanStep(step=4, action="Extract and refresh sources", purpose="Use self-healing gateway for extraction", tool_hint="Web Scraper API / Scraping Browser / Web Unlocker"),
            ResearchPlanStep(step=5, action="Reason across evidence", purpose="Compare source-backed findings and detect gaps"),
            ResearchPlanStep(step=6, action="Synthesize final brief", purpose="Produce sourced intelligence report"),
        ]
