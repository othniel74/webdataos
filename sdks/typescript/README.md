# Web Data Gateway TypeScript SDK

TypeScript client for the **Self-Healing Web Data Gateway**. It works in Node.js runtimes that support `fetch` and can also be used in frontend applications through your backend proxy.

## Install locally

From the SDK folder:

```bash
npm install
npm run build
npm pack
```

In another project:

```bash
npm install ../web-data-unlocked-codebase/sdks/typescript
```

## Basic usage

```ts
import { WebDataGatewayClient } from "@webdata/gateway";

const client = new WebDataGatewayClient({
  baseUrl: "http://localhost:8000",
});

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

console.log(result.status);
console.log(result.data);
console.log(result.recovery_path);
```

## Environment variables

```bash
export WEB_DATA_GATEWAY_URL="http://localhost:8000"
export WEB_DATA_GATEWAY_API_KEY="optional-api-key"
```

## Supported surfaces

- `fetch()` — Track 3 gateway extraction and recovery
- `createTopic()` / `listTopics()` / `refreshTopic()` — Track 2 intelligence pipeline
- `retrieveContext()` — context-aware retrieval
- `research()` — Track 1 live-web research agent
- `listRuns()` — run trace visibility
