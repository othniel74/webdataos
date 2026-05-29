import { WebDataGatewayClient } from "../src";

async function main() {
  const client = new WebDataGatewayClient({ baseUrl: "http://localhost:8000" });
  const report = await client.research({
    task: "Research AI agent infrastructure companies and compare positioning, pricing signals, and recent updates.",
    topic_id: "ai_agent_infrastructure",
    freshness_required: "7_days",
    max_sources: 8,
  });
  console.log(report.summary);
  console.log(report.sources);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
