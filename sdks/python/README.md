# Web Data Gateway Python SDK

Python client for the **Self-Healing Web Data Gateway**. It lets developers use the gateway as an installable SDK instead of calling the HTTP API manually.

## Install locally

From the monorepo root:

```bash
pip install -e sdks/python
```

Or package it:

```bash
cd sdks/python
python -m build
pip install dist/webdata_gateway-0.1.0-py3-none-any.whl
```

## Basic usage

```python
from webdata_gateway import WebDataGatewayClient, GatewayFetchRequest

client = WebDataGatewayClient(base_url="http://localhost:8000")

result = client.fetch(GatewayFetchRequest(
    url="https://example.com/pricing",
    task_type="pricing_extraction",
    preferred_tool="web_scraper_api",
    output_schema={
        "company": "string",
        "pricing_model": "string",
        "features": "list"
    }
))

print(result.status)
print(result.data)
print(result.recovery_path)
```

## Environment variables

```bash
export WEB_DATA_GATEWAY_URL="http://localhost:8000"
export WEB_DATA_GATEWAY_API_KEY="optional-api-key"
```

## Supported surfaces

- `fetch()` — Track 3 gateway extraction and recovery
- `create_topic()` / `list_topics()` / `refresh_topic()` — Track 2 intelligence pipeline
- `retrieve_context()` — context-aware retrieval
- `research()` — Track 1 live-web research agent
- `list_runs()` — run trace visibility
