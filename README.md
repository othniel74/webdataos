# WebDataOS

WebDataOS is an enterprise intelligence operating system for monitoring the public web, proving what changed, reasoning over the impact, and turning the result into actions.

It is built for teams that need continuous intelligence across vendor risk, compliance, competitors, market movement, supplier signals, and account intelligence. The system combines live web retrieval, evidence storage, LLM reasoning, graph memory, workflow hooks, and outcome tracking in one deployable platform.

## What It Solves

Most teams already know useful signals exist on the public web. The hard part is making those signals current, sourced, explainable, and operational.

WebDataOS provides this loop:

```text
Configure monitoring scope
  -> collect live evidence
  -> compare against saved history
  -> reason over business impact
  -> propose actions
  -> show a receipt
  -> record outcomes
```

The product is not only a chat surface. It supports both:

- **Monitor**: scheduled or manual intelligence updates without asking in chat every time.
- **Analyst**: multi-turn investigation over workspace evidence and prior runs.

## Live Deployments

| Surface | URL |
| --- | --- |
| Production frontend | https://webdataos.vercel.app |
| Full-stack Vultr deployment | http://45.77.89.209 |
| API health | http://45.77.89.209/health |
| API readiness | http://45.77.89.209/ready |
| Public demo catalog | http://45.77.89.209/demo/catalog |
| Cognee Local UI | http://45.77.89.209:3200 |
| Cognee reverse proxy | http://45.77.89.209/cognee/ |

## Current Production Status

| Layer | Status |
| --- | --- |
| Frontend | React/Vite UI deployed on Vercel and Vultr. |
| Backend | FastAPI API deployed on Vultr behind Nginx. |
| Tenancy | Clerk sign-in/sign-up is wired on the frontend; backend tenant context scopes customer data. |
| Public demo | Demo sessions, demo workspace setup, demo monitor runs, demo Analyst chat, demo evidence, demo graph, and demo receipts are implemented. |
| Bright Data | Live retrieval is configured for SERP, Web Scraper, Web Unlocker, and Scraping Browser routes. |
| LLM routing | OpenAI is primary; AI/ML API is available as an OpenAI-compatible fallback and model catalog source. |
| Memory | Cognee local is deployed; self-hosted PostgreSQL memory remains available as fallback. |
| Graph | Neo4j is enabled and exposed through graph status, topic, entity, and backfill APIs. |
| Speechmatics | Speech-to-text and text-to-speech adapters are implemented. |
| TriggerWare | Workflow event adapter is implemented; remote delivery is used when an endpoint is configured, otherwise events are recorded locally. |
| Outcomes | Outcome records and stats are database-backed. They populate as actions and recommendations are recorded. |

## Product Surfaces

| Surface | Purpose |
| --- | --- |
| Home | Explains the WebDataOS value loop for buyers, developers, and evaluators. |
| Solution | Shows the three intelligence domains and how teams run each one. |
| Pricing | Describes package tiers without changing runtime capability. |
| Docs | Product and developer documentation entry point. |
| Developer | SDK, API, gateway, and infrastructure explanation for technical users. |
| Demo | Public, limited experience without sign-in. Visitors can choose a mission, enter entities, run a bounded update, chat with Analyst, inspect evidence, and view a graph. |
| Monitor | Operational dashboard for configured intelligence updates and "what changed" reporting. |
| Analyst | Multi-turn chat for asking follow-up questions grounded in workspace evidence and run history. |
| Evidence | Evidence list, detail view, retrieval inspector, and Neo4j knowledge graph view. |
| Actions | Approval queue for recommended operational actions. |
| Outcomes | Feedback loop for measuring whether recommendations were useful. |
| Settings | Workspace context, organization profile, integrations, and tenant configuration. |

## Intelligence Domains

| Domain | Monitors | Typical Signals | Output |
| --- | --- | --- | --- |
| Security & Compliance | Vendors, regulators, domains, security pages | Vendor risk, breach exposure, compliance updates, policy changes | Risk brief, source-backed evidence, recommended mitigation actions. |
| GTM Intelligence | Competitors, accounts, products, markets | Competitor moves, messaging shifts, pricing changes, hiring signals, buying intent | Market brief, account intelligence, competitive movement, sales actions. |
| Finance & Market Intelligence | Companies, suppliers, sectors, market pages | Filings, supplier signals, market movement, alternative data | Market signal, supplier risk, company brief, financial exposure notes. |
| Enterprise Intelligence OS | Cross-domain entities and signals | Shared signals across security, GTM, and finance | Executive brief, cross-domain alerts, shared evidence, action receipt. |

## Architecture

```text
Browser or SDK client
  -> Vercel frontend or Vultr-hosted frontend
  -> Vultr Nginx
  -> FastAPI backend
  -> PostgreSQL persistence
  -> Bright Data gateway for live retrieval
  -> Cognee plus self-hosted memory
  -> Neo4j relationship graph
  -> OpenAI with AI/ML API fallback
  -> Speechmatics transcription and speech synthesis
  -> TriggerWare workflow delivery
```

Runtime intelligence flow:

```text
Workspace scope or demo mission
  -> optional Speechmatics transcription
  -> memory recall from Cognee/self-hosted memory
  -> source discovery and evidence retrieval
  -> freshness filtering and stale-data exclusion
  -> Neo4j graph sync for fresh evidence
  -> LLM synthesis and materiality reasoning
  -> action proposal and workflow receipt
  -> outcome recording
```

## Knowledge Graph

Neo4j is used to make evidence relationships visible instead of hiding them behind summaries.

It stores tenant-scoped relationships among workspaces, entities, evidence records, sources, signals, actions, and outcomes. The frontend exposes the graph in:

- **Monitor**: compact graph context for the current workspace.
- **Evidence**: larger evidence graph and selected entity neighborhood.
- **Analyst**: graph status and cited relationship context during runs.
- **Settings/Developer**: graph health and integration visibility.

Graph APIs return only tenant-scoped data. Demo graph routes use the demo tenant/session scope and do not expose customer data.

## Public Demo

The public demo is designed for judges, buyers, and developers who need to understand the system without signing in.

Demo users can:

- create a short-lived demo session;
- choose a monitoring mission;
- enter a limited set of entities and signals;
- run a rate-limited monitoring update;
- ask bounded Analyst chat questions;
- inspect sourced evidence;
- view the knowledge graph;
- see a run receipt that explains what happened.

Demo users cannot access tenant workspaces, private history, production workflows, or customer data.

## Tenancy and Auth

WebDataOS supports three runtime auth modes:

| Mode | Purpose |
| --- | --- |
| `api_key` | Local development and SDK/service access. |
| `clerk` | Clerk-authenticated customer access. |
| `mixed` | Production mode that supports Clerk customers plus approved public demo routes. |

Tenant-owned data is scoped by tenant context. Clerk users are mapped to an internal WebDataOS tenant and, where available, organization context.

## Partner Integrations

| Partner | Responsibility | Behavior |
| --- | --- | --- |
| Bright Data | Live public-web retrieval | Routes through SERP, Web Scraper, Web Unlocker, and Scraping Browser. SERP responses preserve full JSON where available. |
| OpenAI | Primary LLM provider | Used for synthesis, reasoning, and embeddings when configured. |
| AI/ML API | OpenAI-compatible fallback | Lets the system route to additional model vendors through one compatible provider surface. |
| Cognee | Knowledge memory | Runs locally on Vultr; Cloud credentials are optional. |
| Neo4j | Relationship graph | Stores and returns tenant-scoped graph snapshots for evidence and entity neighborhoods. |
| Speechmatics | Voice input/output | Supports transcription for audio input and speech synthesis for spoken responses. |
| TriggerWare | Workflow automation | Sends material action events to an external workflow endpoint when configured. |

## Environment Configuration

Copy the template and fill only the credentials needed for the environment:

```bash
cp .env.example .env
```

Important variables:

| Variable | Purpose |
| --- | --- |
| `APP_ENV`, `LOG_LEVEL` | Runtime environment and logging. |
| `AUTH_MODE`, `DEFAULT_TENANT_ID` | Auth mode and fallback tenant. |
| `API_AUTH_ENABLED`, `API_KEYS`, `API_KEY_HEADER_NAME` | API-key authentication controls. |
| `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWKS_URL`, `CLERK_ISSUER`, `CLERK_AUDIENCE` | Clerk tenancy and JWT verification. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Frontend Clerk key embedded at build time. |
| `PUBLIC_DEMO_ENABLED`, `DEMO_TENANT_ID`, `DEMO_SESSION_TTL_HOURS`, `DEMO_RATE_LIMIT_PER_HOUR` | Public demo controls. |
| `DATABASE_URL`, `SYNC_DATABASE_URL` | Async and sync PostgreSQL connection strings. |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Primary LLM provider. |
| `AIMLAPI_API_KEY`, `AIMLAPI_BASE_URL`, `AIMLAPI_MODELS_URL`, `AIMLAPI_MODEL` | AI/ML API fallback and model catalog configuration. |
| `BRIGHTDATA_API_KEY`, `BRIGHTDATA_API_ENDPOINT`, `BRIGHTDATA_SCRAPER_ENDPOINT`, `BRIGHTDATA_*_ZONE` | Bright Data live retrieval and recovery routes. |
| `COGNEE_ENDPOINT`, `COGNEE_API_KEY`, `COGNEE_UI_PORT`, `COGNEE_LLM_MODEL`, `COGNEE_EMBEDDING_MODEL` | Cognee Cloud/local memory configuration. |
| `NEO4J_ENABLED`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` | Neo4j Aura or self-hosted graph configuration. |
| `SPEECHMATICS_API_KEY`, `SPEECHMATICS_ENDPOINT` | Speechmatics speech-to-text configuration. |
| `SPEECHMATICS_TTS_ENDPOINT`, `SPEECHMATICS_TTS_VOICE` | Speechmatics text-to-speech configuration. |
| `TRIGGERWARE_API_KEY`, `TRIGGERWARE_ENDPOINT`, `TRIGGERWARE_WEBHOOK_SECRET` | TriggerWare workflow delivery and optional signing. |
| `VITE_API_BASE_URL`, `VITE_API_KEY` | Frontend API connection settings. |

Do not commit real secrets. Production credentials should live in Vultr, Vercel, or a dedicated secret manager.

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

The frontend lives in `apps/web`. For local API access, set `VITE_API_BASE_URL=http://localhost:8000`.

## Deployment

| Target | Documentation |
| --- | --- |
| Vultr full stack | `docs/deployment/VULTR.md` |
| Vercel frontend with Vultr API | `docs/deployment/VERCEL.md` |

Current production pattern:

```text
Vercel frontend
  -> Vercel rewrites for API routes
  -> Vultr Nginx
  -> FastAPI backend
  -> PostgreSQL, Cognee local, Neo4j, and partner APIs
```

Vultr can also serve the frontend and backend together for a fully self-hosted deployment.

## API Surface

### Health and Runtime

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Runtime health, provider availability, auth mode, and demo status. |
| `GET` | `/ready` | Readiness check. |
| `GET` | `/metrics` | Prometheus metrics. |
| `GET` | `/llm/providers` | LLM provider availability and routing status. |
| `GET` | `/llm/aimlapi/models` | AI/ML API model catalog proxy. |

### Public Demo

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/demo/catalog` | List demo missions and allowed signals. |
| `POST` | `/demo/sessions` | Create a short-lived anonymous demo session. |
| `GET` | `/demo/sessions/current` | Resolve the current demo session. |
| `POST` | `/demo/workspaces` | Configure a limited demo workspace. |
| `POST` | `/demo/monitor/run` | Run a bounded demo monitoring update. |
| `POST` | `/demo/analyst/chat` | Ask Analyst questions grounded in demo evidence. |
| `GET` | `/demo/evidence` | List evidence for the demo session. |
| `GET` | `/demo/graph` | Return demo graph snapshot. |
| `GET` | `/demo/receipt/{run_id}` | Return demo run receipt. |
| `GET` | `/demo/runs/latest` | Return the latest demo run. |

### Workspace and Monitoring

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/workspaces/packages` | List intelligence packages. |
| `POST` | `/workspaces` | Create a tenant-scoped workspace. |
| `GET` | `/workspaces` | List tenant-scoped workspaces. |
| `GET` | `/workspaces/{workspace_id}` | Get one workspace. |
| `GET` | `/monitor/{workspace_id}` | Get monitoring summary. |
| `POST` | `/monitor/{workspace_id}/run` | Run monitoring now. |
| `GET` | `/runs` | List agent/monitor runs. |
| `GET` | `/runs/{run_id}` | Get run details and report. |

### Analyst, Evidence, and Graph

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/agent/research` | Run a research task and generate a report. |
| `GET` | `/chat/{workspace_id}` | Load multi-turn Analyst chat history. |
| `POST` | `/chat/{workspace_id}` | Send a multi-turn Analyst chat message. |
| `DELETE` | `/chat/{workspace_id}` | Clear workspace chat history. |
| `POST` | `/gateway/fetch` | Fetch live web evidence through the Bright Data recovery gateway. |
| `POST` | `/intelligence/topics` | Create an intelligence topic. |
| `GET` | `/intelligence/topics` | List intelligence topics. |
| `POST` | `/intelligence/topics/{topic_id}/discover` | Discover sources through live search. |
| `POST` | `/intelligence/topics/{topic_id}/refresh` | Refresh records for a topic. |
| `GET` | `/intelligence/records` | List evidence records with stale-data filtering support. |
| `POST` | `/intelligence/retrieve` | Retrieve ranked evidence. |
| `POST` | `/intelligence/retrieval/context` | Retrieve ranked evidence context for reasoning. |
| `GET` | `/graph/status` | Neo4j status and graph counts. |
| `GET` | `/graph/topics/{topic_id}` | Graph snapshot for a workspace/topic. |
| `POST` | `/graph/topics/{topic_id}/backfill` | Sync fresh evidence into Neo4j. |
| `GET` | `/graph/entities/{entity}` | Entity neighborhood graph. |

### Actions, Outcomes, and Partners

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/context` | Upsert organizational context. |
| `GET` | `/context/{workspace_id}` | Get organizational context. |
| `GET` | `/actions/{workspace_id}` | List autonomous actions. |
| `POST` | `/actions/{action_id}/approve` | Approve or reject an action. |
| `POST` | `/actions/{action_id}/execute` | Execute an approved action. |
| `POST` | `/outcomes` | Record a recommendation outcome. |
| `GET` | `/outcomes/{workspace_id}` | List workspace outcomes. |
| `GET` | `/outcomes/{workspace_id}/stats` | Get outcome statistics. |
| `POST` | `/transcriptions` | Submit or normalize transcription input. |
| `POST` | `/transcriptions/upload` | Upload audio for Speechmatics transcription. |
| `POST` | `/speech/synthesize` | Generate spoken response audio. |
| `POST` | `/memory/upsert` | Store evidence in memory. |
| `POST` | `/memory/search` | Search Cognee/self-hosted memory. |
| `POST` | `/workflows/trigger` | Send a workflow event through TriggerWare. |
| `GET` | `/triggerware/events` | List recorded TriggerWare events. |

## Operational Behavior

WebDataOS degrades by capability instead of failing the whole runtime:

| Missing dependency | Behavior |
| --- | --- |
| Bright Data credentials | Local fallback responses can be used for development; production should use live Bright Data credentials. |
| OpenAI key | AI/ML API can be used when configured; otherwise synthesis falls back to deterministic output. |
| AI/ML API key | OpenAI remains the primary provider. |
| Cognee Cloud credentials | Local Cognee is used. |
| Cognee local runtime | Self-hosted memory remains available. |
| Speechmatics key | Typed text workflows continue; audio transcription and speech synthesis are unavailable. |
| TriggerWare endpoint | Workflow events are recorded locally instead of delivered externally. |
| Neo4j | PostgreSQL-backed storage continues without graph persistence. |

## Verification

Before deployment, run:

```bash
python -m ruff check apps packages tests
python -m pytest -q
cd apps/web
npm run build
```

Production smoke checks:

```bash
curl https://webdataos.vercel.app/health
curl https://webdataos.vercel.app/ready
curl https://webdataos.vercel.app/demo/catalog
curl https://webdataos.vercel.app/graph/status
```

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
  graph/                Neo4j graph client and snapshots
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
| Public demo without sign-in | Implemented with scoped demo sessions and demo-only routes. |
| Clerk tenancy | Implemented for sign-in/sign-up and tenant-scoped backend access. |
| Tenant isolation | Tenant context is wired through customer routes and graph queries. |
| Live monitoring dashboard | Implemented through Monitor and `/monitor/{workspace_id}` routes. |
| Multi-turn Analyst chat | Implemented through `/chat/{workspace_id}` history and message routes. |
| Evidence inspector | Implemented with evidence list, detail, retrieval context, and graph panels. |
| Knowledge graph frontend | Implemented with compact and expanded graph views backed by Neo4j APIs. |
| Bright Data integration | Implemented and configured for live production use. |
| LLM provider fallback | OpenAI primary with AI/ML API fallback. |
| Cognee integration | Local Cognee deployment is live; Cloud mode remains optional. |
| Speechmatics integration | Implemented for transcription and speech synthesis workflows. |
| TriggerWare integration | Adapter implemented with local event recording and remote delivery when configured. |
| Outcome learning | Database-backed outcome recording and statistics are live. |
| Self-hosted deployment | Vultr full-stack deployment is live. |
| Hosted frontend deployment | Vercel frontend deployment is live. |

## License

Proprietary. All rights reserved.
