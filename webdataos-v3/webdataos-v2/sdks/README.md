# SDKs

This folder contains standalone SDK packages for developers who want to integrate the Self-Healing Web Data Gateway without manually calling the REST API.

## Included SDKs

```text
sdks/
  python/       # pip-installable Python SDK: webdata-gateway
  typescript/   # npm package: @webdata/gateway
```

## Why SDKs are included

The infrastructure track is stronger when developers can adopt the gateway in two ways:

1. **Hosted/API Gateway mode** — call the FastAPI service directly.
2. **SDK mode** — install a Python or TypeScript client and use typed methods.

Both SDKs expose the same core surfaces:

- gateway extraction and recovery
- topic creation and refresh
- context-aware retrieval
- live-web research agent execution
- run trace listing

## Local development

Start the backend first:

```bash
cp .env.example .env
make up
```

Then install either SDK:

```bash
pip install -e sdks/python
```

or:

```bash
cd sdks/typescript
npm install
npm run build
```
