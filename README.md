# WebDataOS

Enterprise live-web intelligence runtime for AI agents.

WebDataOS turns public web signals into sourced intelligence briefs, reusable memory, and operational actions for Security & Compliance, GTM Intelligence, and Finance & Market Intelligence teams. It combines live Bright Data retrieval, LLM synthesis, Cognee knowledge memory, self-hosted fallback memory, Speechmatics transcription, TriggerWare workflow hooks, and outcome learning in one deployable platform.

## Live Deployments

| Surface | URL |
| --- | --- |
| Production frontend | https://webdataos.vercel.app |
| Full-stack Vultr deployment | http://45.77.89.209 |
| API health | http://45.77.89.209/health |
| Cognee Local UI | http://45.77.89.209:3200 |
| Cognee reverse proxy | http://45.77.89.209/cognee/ |

## Current Production Status

| Layer | Status |
| --- | --- |
| Frontend | React/Vite UI deployed on Vercel and Vultr. |
| Backend | FastAPI API deployed on Vultr behind Nginx. |
| Bright Data | Live credentials configured for SERP, Web Scraper, Web Unlocker, and Scraping Browser. |
| LLM routing | OpenAI primary with AI/ML API fallback. AI/ML API model listing is exposed through the API. |
| Memory | Cognee local is deployed; self-hosted PostgreSQL memory remains available as fallback. |
| Speechmatics | API key configured; endpoint defaults to the Speechmatics batch transcription API. |
| TriggerWare | Adapter is implemented; a production endpoint must be provided before live workflow delivery. |
| Outcomes | Outcome records and stats are live database-backed views. They start empty until real outcomes are recorded. |

## Architecture

```text
User request or audio upload
  -> Speechmatics transcription, when audio is supplied
  -> Memory recall through Cognee local/cloud plus self-hosted fallback search
  -> Intelligence engine checks freshness and retrieves evidence
  -> Bright Data gateway routes across SERP, Web Scraper, Scraping Browser, and Web Unlocker
  -> LLM synthesizer uses OpenAI with AI/ML API fallback
  -> Reasoning engine applies workspace context and materiality rules
  -> Autonomous action proposals are generated behind approval gates
  -> Outcomes are recorded for learning and score calibration
  -> TriggerWare can send material events to downstream workflows
```

## Core Capabilities

| Capability | Description |
| --- | --- |
| Live web retrieval | Self-healing Bright Data gateway with failure detection, recovery routing, and normalized evidence records. |
| Workspace intelligence | Package-based workflows for security, GTM, finance, and enterprise-wide intelligence. |
| Organizational context | Contracts, risk thresholds, financial exposure, renewal calendars, priorities, and compliance requirements per workspace. |
| LLM synthesis | OpenAI-compatible synthesis with OpenAI first and AI/ML API fallback. |
| Provider flexibility | AI/ML API support allows additional model vendors through one OpenAI-compatible interface. |
| Knowledge memory | Cognee knowledge graph memory is primary; PostgreSQL-backed semantic or keyword memory is available as fallback. |
| Transcription | Speechmatics batch transcription for audio URL workflows, with typed transcript support for direct input. |
| Workflow automation | TriggerWare event delivery for downstream actions when a workflow endpoint is configured. |
| Outcome learning | Recommendations can be scored against actual outcomes to measure hit rate, signal accuracy, and entity accuracy. |

## Next Product Milestone

The next implementation milestone is documented in `docs/TENANCY_DEMO_GRAPH_PLAN.md`.

It covers:

- Clerk-backed tenant sign-in and organization isolation;
- a public demo that lets visitors configure a limited monitoring mission without signing in;
- bounded demo Analyst chat grounded only in demo evidence;
- tenant-scoped Neo4j knowledge graph visibility in Monitor and Evidence;
- local-first implementation, verification, and deployment sequence.

## Partner Integrations

| Partner | Responsibility | Notes |
| --- | --- | --- |
| Bright Data | Public web evidence retrieval | Used for SERP, scraping, browser automation, and unlocker recovery. |
| OpenAI | Primary chat and embedding provider | Used for LLM synthesis and semantic memory when configured. |
| AI/ML API | OpenAI-compatible fallback LLM provider | Supports multiple model vendors through the configured AI/ML API model. |
| Cognee | Knowledge graph memory | Runs locally in the Vultr deployment; Cloud credentials are optional. |
| Speechmatics | Speech-to-text | Used for audio URL transcription before intelligence enrichment. |
| TriggerWare | Workflow automation | Sends material events when endpoint credentials are configured. |
| Neo4j | Entity graph storage | Optional Aura/self-hosted graph backend for relationship storage. |

## Environment Configuration

Copy the template and fill only the credentials needed for the environment:

```bash
cp .env.example .env
```

Important variables:

| Variable | Purpose |
| --- | --- |
| `APP_ENV`, `LOG_LEVEL` | Runtime environment and logging. |
| `API_AUTH_ENABLED`, `API_KEYS`, `API_KEY_HEADER_NAME` | API authentication controls. |
| `DATABASE_URL`, `SYNC_DATABASE_URL` | Async and sync PostgreSQL connection strings. |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Primary LLM and embedding provider. |
| `AIMLAPI_API_KEY`, `AIMLAPI_BASE_URL`, `AIMLAPI_MODELS_URL`, `AIMLAPI_MODEL` | AI/ML API fallback provider and model catalog configuration. |
| `BRIGHTDATA_API_KEY`, `BRIGHTDATA_*` | Bright Data live retrieval and recovery routes. |
| `COGNEE_ENDPOINT`, `COGNEE_API_KEY` | Optional Cognee Cloud configuration. Leave empty for local Cognee. |
| `COGNEE_UI_PORT`, `COGNEE_LLM_MODEL`, `COGNEE_EMBEDDING_MODEL` | Local Cognee UI and model settings. |
| `SPEECHMATICS_API_KEY`, `SPEECHMATICS_ENDPOINT` | Speechmatics transcription configuration. |
| `TRIGGERWARE_API_KEY`, `TRIGGERWARE_ENDPOINT`, `TRIGGERWARE_WEBHOOK_SECRET` | TriggerWare workflow delivery, optional API key, and optional HMAC signature secret. |
| `NEO4J_ENABLED`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` | Optional graph database configuration. |
| `VITE_API_BASE_URL`, `VITE_API_KEY` | Frontend build-time API connection settings. |

Do not commit real secrets. Production credentials should be stored in the deployment environment on Vultr, Vercel, or the relevant secret manager.

## Local Development

### Docker Compose

```bash
docker compose -f infra/docker-compose.yml up --build
```

This starts the API, web UI, PostgreSQL, Neo4j, Prometheus, and Grafana services defined in the local Compose stack.

### Backend

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -e ".[dev]"
uvicorn apps.api.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd apps/web
npm install
npm run dev
```

The frontend lives in `apps/web` and talks to the backend through `VITE_API_BASE_URL`. When API authentication is enabled, it sends `VITE_API_KEY` using the configured API key header.

## Deployment

| Target | Documentation |
| --- | --- |
| Vultr full stack | `docs/deployment/VULTR.md` |
| Vercel frontend with Vultr API | `docs/deployment/VERCEL.md` |

The current production pattern is:

```text
Vercel frontend -> Vultr Nginx -> FastAPI backend -> PostgreSQL / Cognee / partner APIs
```

Vultr can also serve the frontend and backend together for a fully self-hosted deployment.

## API Surface

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Runtime health and partner integration status. |
| `GET` | `/ready` | Readiness check. |
| `GET` | `/llm/providers` | LLM provider availability and routing status. |
| `GET` | `/llm/aimlapi/models` | AI/ML API model catalog proxy. |
| `GET` | `/workspaces/packages` | List intelligence packages. |
| `POST` | `/workspaces` | Create a workspace. |
| `GET` | `/workspaces` | List workspaces. |
| `POST` | `/agent/research` | Run a research task and generate a report. |
| `POST` | `/gateway/fetch` | Fetch live web evidence through the Bright Data recovery gateway. |
| `POST` | `/intelligence/topics` | Create an intelligence topic. |
| `POST` | `/intelligence/topics/{id}/discover` | Discover sources through live search. |
| `POST` | `/intelligence/topics/{id}/refresh` | Refresh records for a topic. |
| `GET` | `/intelligence/records` | List evidence records. |
| `POST` | `/intelligence/retrieval/context` | Retrieve ranked evidence context. |
| `POST` | `/transcriptions` | Submit or normalize transcription input. |
| `POST` | `/memory/upsert` | Store evidence in memory. |
| `POST` | `/memory/search` | Search Cognee/self-hosted memory. |
| `POST` | `/workflows/trigger` | Send a workflow event through TriggerWare. |
| `POST` | `/context` | Upsert organizational context. |
| `GET` | `/context/{workspace_id}` | Get organizational context. |
| `GET` | `/actions/{workspace_id}` | List autonomous actions. |
| `POST` | `/actions/{id}/approve` | Approve or reject an action. |
| `POST` | `/actions/{id}/execute` | Execute an approved action. |
| `POST` | `/outcomes` | Record a recommendation outcome. |
| `GET` | `/outcomes/{workspace_id}` | List workspace outcomes. |
| `GET` | `/outcomes/{workspace_id}/stats` | Get outcome statistics. |
| `GET` | `/runs` | List agent runs. |
| `GET` | `/runs/{id}` | Get run details and report. |
| `GET` | `/metrics` | Prometheus metrics. |

## Intelligence Packages

| Package | Entities | Signals | Output |
| --- | --- | --- | --- |
| Security & Compliance | Vendors, regulators, domains, security pages | Vendor risk, regulatory change, breach exposure, compliance | Risk brief, evidence, recommended actions. |
| GTM Intelligence | Competitors, accounts, products, markets | Competitor moves, pricing changes, messaging shifts, buying signals | Market brief, account intelligence, competitive changes. |
| Finance & Market Intelligence | Companies, suppliers, sectors, market pages | Filings, supplier signals, market movement, alternative data | Market signal, company brief, supplier risk. |
| Enterprise Intelligence OS | Cross-domain entities | Cross-domain signals | Executive brief, cross-track alerts, shared evidence. |

## Operational Behavior

WebDataOS is designed to degrade gracefully. Missing optional credentials reduce capability instead of preventing the platform from starting:

| Missing dependency | Behavior |
| --- | --- |
| Bright Data credentials | Local fallback responses are used for development. Production should set live Bright Data credentials. |
| OpenAI key | AI/ML API can be used when configured; otherwise synthesis falls back to deterministic output. |
| AI/ML API key | OpenAI remains the primary provider. |
| Cognee Cloud credentials | Local Cognee is used. |
| Cognee local runtime | Self-hosted memory remains available. |
| Speechmatics key | Typed transcripts and text workflows continue. |
| TriggerWare endpoint | Workflow events are recorded locally instead of being delivered externally. |
| Neo4j | PostgreSQL-backed storage continues without graph persistence. |

## Project Structure

```text
apps/
  api/                  FastAPI backend
    main.py             Application entry point and health routes
    dependencies.py     Service wiring
    db/                 SQLAlchemy models and sessions
    routes/             API route handlers
  web/                  React/Vite frontend
    src/main.jsx        Main application UI
packages/
  agents/               Research orchestration and synthesis
  brightdata/           Bright Data API clients
  common/               Runtime configuration and shared utilities
  enterprise/           Intelligence package definitions
  gateway/              Self-healing retrieval gateway
  intelligence/         Evidence records, topics, and retrieval
  llm/                  OpenAI and AI/ML API routing
  memory/               Cognee and self-hosted memory providers
  outcomes/             Outcome tracking and analytics
  partners/             Speechmatics, Cognee, and TriggerWare adapters
  reasoning/            Materiality and action reasoning
  schemas/              Pydantic models
infra/                  Docker Compose, Nginx, Prometheus, Grafana
docs/                   Product and deployment documentation
tests/                  Automated test suite
```

## Requirement Alignment

| Requirement | Status |
| --- | --- |
| Bright Data integration | Implemented and configured for live production use. |
| Enterprise use cases | Security & Compliance, GTM Intelligence, and Finance & Market Intelligence are represented as first-class packages. |
| LLM provider fallback | OpenAI primary with AI/ML API fallback. |
| Cognee integration | Local Cognee deployment is live; Cloud mode remains optional. |
| Speechmatics integration | Implemented for transcription workflows. |
| TriggerWare integration | Adapter implemented; production endpoint still required. |
| Outcome learning | Database-backed outcome recording and statistics are live. |
| Self-hosted deployment | Vultr full-stack deployment is live. |
| Hosted frontend deployment | Vercel frontend deployment is live. |

## License

Proprietary. All rights reserved.
