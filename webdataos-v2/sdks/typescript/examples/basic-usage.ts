import { WebDataGatewayClient } from "../src";

async function main() {
  const client = new WebDataGatewayClient({ baseUrl: "http://localhost:8000" });
  const result = await client.fetch({
    url: "https://example.com/pricing",
    task_type: "pricing_extraction",
    preferred_tool: "web_scraper_api",
    output_schema: {
      company: "string",
      pricing_model: "string",
      features: "list",
    },
  });
  console.log(result.status, result.tool_used);
  console.log(result.data);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
