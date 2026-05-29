# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

WebDataOS is an enterprise intelligence operating system. It monitors the public web, detects what changed, reasons over business impact, and turns results into actions. The core loop: **configure scope → collect live evidence → compare against history → reason → propose actions → show a decision brief → record outcomes**.

There are two main interaction modes: **Monitor** (scheduled/manual intelligence updates) and **Analyst** (multi-turn chat grounded in workspace evidence). Every successful run produces a **decision brief** — the user-facing value contract across both surfaces and the public demo.

## Commands

### Backend

```bash
# Install (from repo root, with venv active)
pip install -e ".[dev]"

# Run API locally
uvicorn apps.api.main:app --reload --host 0.0.0.0 --port 8000

# Lint
python -m ruff check apps packages tests

# All tests
python -m pytest -q

# Single test file
python -m pytest tests/test_agent_value_loop.py -q

# Single test by name
python -m pytest -k "test_value_loop_marks_first_successful_run_as_baseline" -q

# DB migrations (local)
alembic upgrade head
```

### Frontend

```bash
cd apps/web
npm install
npm run dev     # dev server on port 5173
npm run build   # production build
```

### Docker (local full stack)

```bash
# Start core services (postgres + api + web)
docker compose -f infra/docker-compose.yml up --build

# Start with monitoring (Prometheus + Grafana)
docker compose -f infra/docker-compose.yml --profile monitoring up --build

# Start with Neo4j
docker compose -f infra/docker-compose.yml --profile full up --build

# Production deploy (Vultr)
docker compose -f infra/docker-compose.yml -f infra/docker-compose.vultr.yml --profile production --profile monitoring up -d --build

# Shell into API container
docker compose -f infra/docker-compose.yml exec api bash

# psql
docker compose -f infra/docker-compose.yml exec postgres psql -U postgres -d webdata
```

### SDK builds

```bash
cd sdks/python && python -m build
cd sdks/typescript && npm install && npm run build
```

## Architecture

### Layer overview

```
Browser / SDK
  → React/Vite SPA (apps/web)
  → FastAPI backend (apps/api)
  → PostgreSQL (primary persistence)
  → GatewayService → Bright Data (SERP, Web Scraper, Web Unlocker, Scraping Browser)
  → IntelligenceService (evidence records, source discovery, freshness)
  → LLMClient (OpenAI primary → AI/ML API fallback)
  → ReasoningEngine (materiality + action proposals)
  → MemoryProvider → Cognee (graph) + self-hosted (embeddings/keyword)
  → Neo4j (relationship graph, tenant-scoped)
  → TriggerWareService (workflow events, local or remote)
  → SpeechmaticsService (transcription + TTS)
```

### Runtime intelligence flow (`ResearchAgentOrchestrator.run`)

The orchestrator in [packages/agents/orchestrator.py](packages/agents/orchestrator.py) is the core runtime. Every monitor run and analyst chat turn goes through it:

1. **Transcribe** — if voice/audio input, Speechmatics transcribes first
2. **Memory search** — Cognee graph + self-hosted embedding search for prior context
3. **Retrieve context** — rank existing `IntelligenceRecord`s by query relevance; freshness-filtered
4. **Live refresh** — if <2 matching records, call Bright Data through `GatewayService` to pull fresh evidence
5. **Synthesize** — `ReportSynthesizer` calls LLM with evidence + memory; falls back to rule-based if no LLM
6. **Reason** — `ReasoningEngine` evaluates evidence against org context using package-specific frameworks; produces materiality assessments + recommendations
7. **Propose actions** — autonomous `AutonomousAction` records written to DB; require approval before execution
8. **Memory upsert** — write synthesis result back to Cognee + self-hosted memory
9. **Workflow trigger** — send material signal event to TriggerWare (local recording or remote delivery)
10. **Decision brief** — assembled from all of the above; this is the primary user-facing output
11. **AgentRun record** — full `ResearchReport` JSON persisted to DB

### Package responsibilities

| Package | Role |
|---|---|
| `packages/agents` | `ResearchAgentOrchestrator` (run loop), `ResearchPlanner` (task decomposition), `ReportSynthesizer` (LLM + rule-based synthesis) |
| `packages/brightdata` | Thin `BrightDataClient` wrapping SERP, Web Scraper, Web Unlocker, and Scraping Browser endpoints |
| `packages/gateway` | Self-healing retrieval gateway: failure detection → tool rotation → normalization. Routes: SERP → Web Scraper → Web Unlocker → Scraping Browser |
| `packages/intelligence` | `IntelligenceService`: topic/source/record CRUD, source discovery, evidence refresh, freshness scoring, Neo4j graph sync, retrieval ranking |
| `packages/llm` | `LLMClient`: async OpenAI-compatible client. OpenAI primary → AI/ML API fallback. `available` property gates all LLM paths |
| `packages/reasoning` | `ReasoningEngine`: package-specific frameworks (security/gtm/finance/enterprise), materiality assessments, action proposals. Mock mode when no LLM |
| `packages/memory` | `MemoryProvider`: routes between Cognee and self-hosted. Writes to both; reads Cognee first then merges self-hosted results |
| `packages/partners` | `CogneeMemoryService`, `SpeechmaticsService`, `TriggerWareService` adapters |
| `packages/graph` | `Neo4jGraphClient`: tenant-scoped graph snapshots, entity neighborhoods, backfill from evidence records |
| `packages/enterprise` | `IntelligencePack` definitions (security, gtm, finance, enterprise). Packs define default entities, signals, and reasoning framework |
| `packages/schemas` | Pydantic v2 models for all cross-package contracts |
| `packages/common` | `Settings` (pydantic-settings, `.env`-backed), auth, security, logging, rate limiting, circuit breaker |
| `packages/observability` | OpenTelemetry wiring, Prometheus metrics (`AGENT_RUNS`, `GATEWAY_LATENCY`, etc.) |

### Data model key tables

- **`tenants`** — every customer or internal workspace belongs to a tenant
- **`topics`** — a workspace (= monitoring scope): entities, signals, refresh cadence. ID format: `workspace_{name}` or `{tenant_id}_workspace_{name}` for non-default tenants
- **`intelligence_records`** — extracted evidence: source URL, entity, summary, confidence, freshness status, optional embedding text
- **`agent_runs`** — full `ResearchReport` JSON including decision brief and run receipt
- **`autonomous_actions`** — proposed actions generated per run; `pending_approval → approved → executed`
- **`change_events`** — field-level diffs detected between refresh runs
- **`memory_entries`** — self-hosted memory with optional embedding vectors
- **`chat_messages`** — durable analyst conversation history per workspace
- **`outcomes`** — user feedback on recommendations (acted/dismissed/deferred/false_alarm/confirmed_useful)

### Auth model

Three modes controlled by `AUTH_MODE`:

- `api_key` — dev/SDK access; `API_AUTH_ENABLED=false` disables all auth in dev
- `custom` — first-party WebDataOS email/password; JWT signed by `AUTH_JWT_SECRET`
- `mixed` — production; accepts WebDataOS sessions, API keys, and Clerk JWTs; also allows unauthenticated public demo routes

`AuthContext` (returned by `require_api_key` in `packages/common/security.py`) carries `tenant_id`, `role`, `auth_type`, and `is_demo`. Every route uses it for tenant scoping.

### Workspace ID scoping

`workspace_resolution.py` handles workspace lookup. Non-default tenants get their workspace IDs prefixed: `{tenant_id}_workspace_{name}`. `resolve_workspace` tries the scoped ID first, then falls back to the bare ID, but only returns the topic if `tenant_id` matches — this is the tenant isolation boundary.

### Gateway recovery chain

`GatewayService` attempts retrieval across Bright Data tools in order: SERP → Web Scraper → Scraping Browser → Web Unlocker → MCP server. `FailureDetector` classifies each response; `RecoveryRouter` picks the next tool. Failure and latency are tracked per-tool via Prometheus. `MOCK_BRIGHTDATA=true` (default in dev) skips real calls.

### Frontend

The entire SPA lives in a single file: [apps/web/src/main.jsx](apps/web/src/main.jsx). It is a React 18 + Vite app with no routing library — page transitions are managed by a `view` state variable. Auth tokens are stored in `localStorage` under `webdataos.auth.session`. The `API` constant is set from `VITE_API_BASE_URL`; in dev it defaults to `http://localhost:8000`. Demo routes use a separate `demoApi()` helper with `X-Demo-Session` header instead of auth headers.

### Graceful degradation

The system degrades by capability, not by failure. Missing Bright Data → mock responses. No LLM → rule-based synthesis. No Cognee → self-hosted memory. No Neo4j → PostgreSQL-only. No TriggerWare endpoint → local event recording. Check `GET /health` to see which providers are live.

## Environment

Copy `.env.example` to `.env`. Key variables for local dev:

| Variable | Local default |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@localhost:5432/webdata` |
| `MOCK_BRIGHTDATA` | `true` |
| `AUTH_MODE` | `api_key` |
| `API_AUTH_ENABLED` | `false` |
| `NEO4J_ENABLED` | `false` |
| `OPENAI_API_KEY` | unset (synthesis falls back to rule-based) |
| `VITE_API_BASE_URL` | `http://localhost:8000` |

In dev with `API_AUTH_ENABLED=false`, all requests are accepted as `dev-anonymous` with `tenant_internal` scope. No API key needed.

## Pre-deploy checks

```bash
python -m ruff check apps packages tests
python -m pytest -q
cd apps/web && npm run build
```
