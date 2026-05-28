# WebDataOS

WebDataOS is an enterprise intelligence operating system. It monitors the public web, detects what changed, reasons over business impact, and turns results into actions.

The core loop: **configure scope → collect live evidence → compare against history → reason → propose actions → show a decision brief → record outcomes.**

---

## What It Solves

Most teams already know useful signals exist on the public web. The hard part is making those signals current, sourced, explainable, and operational — without rebuilding the same research every quarter.

WebDataOS delivers:

- **Continuous monitoring** across vendors, competitors, markets, suppliers, and accounts
- **Source-backed decision briefs** with cited evidence, materiality assessments, and recommended next steps
- **Persistent knowledge graph** that accumulates organizational memory across every run
- **Action approval workflows** with human-in-the-loop gates before anything executes
- **Outcome tracking** that closes the loop between recommendations and results

There are two primary interaction modes:

- **Monitor** — scheduled or manual intelligence updates that run without asking in chat
- **Analyst** — multi-turn investigation grounded in workspace evidence and run history

Every successful run produces a **decision brief**: a concise answer, what changed, why it matters, the recommended next action, cited evidence links, unresolved gaps, graph context, and a run receipt.

---

## Live Deployments

| Surface | URL |
|---|---|
| Production frontend | https://webdataos.vercel.app |
| Full-stack Vultr deployment | http://45.77.89.209 |
| API health | http://45.77.89.209/health |
| API readiness | http://45.77.89.209/ready |
| Public demo catalog | http://45.77.89.209/demo/catalog |
| Cognee local UI | http://45.77.89.209:3200 |
| Cognee reverse proxy | http://45.77.89.209/cognee/ |

---

## Production Status

| Layer | Status |
|---|---|
| Frontend | React/Vite SPA deployed on Vercel and Vultr with professional scroll-reveal animations and interactive knowledge graph |
| Backend | FastAPI on Vultr behind Nginx; 40/40 tests passing |
| Tenancy | Full tenant isolation; first-party sign-in/sign-up; workspace ID prefixing for non-default tenants |
| Auth | Three modes: `api_key`, `custom` (WebDataOS JWT), `mixed` (production); Clerk JWT support; managed API keys with SHA-256 hash storage |
| RBAC | Role-based access control enforced on write operations; `analyst` role blocked from action approval, execution, workspace creation, and API key management |
| Audit logging | Every write and sensitive read logged to `audit_logs` with principal, auth type, path, status code, and duration |
| Public demo | Demo sessions, workspace setup, monitor runs, Analyst chat, evidence, knowledge graph, and run receipts — all scoped to demo tenant |
| Bright Data | Live retrieval configured for SERP, Web Scraper, Web Unlocker, and Scraping Browser with self-healing gateway |
| LLM routing | OpenAI primary; AI/ML API OpenAI-compatible fallback |
| Memory | Cognee local deployed; self-hosted PostgreSQL + pgvector embeddings available as fallback |
| Graph | Neo4j enabled with enterprise fact projection, cross-entity relationships, signal timeline, risk posture, and run lineage APIs |
| Rate limiting | Redis-backed per-tenant rate limiting |
| Observability | OpenTelemetry + Prometheus metrics per gateway tool and agent run; Grafana dashboards |
| Speechmatics | Speech-to-text and text-to-speech adapters implemented |
| TriggerWare | Workflow event adapter with local recording and remote delivery |
| Outcomes | Database-backed outcome records and statistics |
| Named entity extraction | Post-synthesis LLM pass extracts real company, regulation, and product names from evidence; written into `extracted_entities` on every run |
| Change detection | `ChangeDetectionService` diffs each run against the previous run; decision briefs now show delta headlines like "+2 new signals \| 4 new entities (vs 2 days ago)" |
| Source quality tiering | T1 (official: CVE, SEC, vendor trust pages), T2 (major news), T3 (other); T1 sources get 1.4× retrieval ranking boost; tier badges in evidence panel |

---

## Intelligence Domains

| Domain | Monitors | Typical Signals | Output |
|---|---|---|---|
| Security & Compliance | Vendors, regulators, domains, security pages | Vendor risk, breach exposure, compliance updates, policy changes | Risk brief, source-backed evidence, recommended mitigation actions |
| GTM Intelligence | Competitors, accounts, products, markets | Competitor moves, messaging shifts, pricing changes, hiring signals, buying intent | Market brief, account intelligence, competitive movement, sales actions |
| Finance & Market Intelligence | Companies, suppliers, sectors, market pages | Filings, supplier signals, market movement, alternative data | Market signal, supplier risk, company brief, financial exposure notes |
| Enterprise Intelligence OS | Cross-domain entities and signals | Shared signals across security, GTM, and finance | Executive brief, cross-domain alerts, shared evidence, action receipt |

---

## Architecture

```text
Browser / SDK
  → React/Vite SPA (apps/web)
  → FastAPI backend (apps/api)
  → PostgreSQL (primary persistence + pgvector embeddings)
  → Redis (rate limiting)
  → GatewayService → Bright Data (SERP, Web Scraper, Web Unlocker, Scraping Browser)
  → IntelligenceService (evidence records, source discovery, freshness)
  → LLMClient (OpenAI primary → AI/ML API fallback)
  → ReasoningEngine (materiality + action proposals)
  → MemoryProvider → Cognee (graph) + self-hosted (embeddings/keyword)
  → Neo4j (relationship graph, tenant-scoped)
  → TriggerWareService (workflow events, local or remote)
  → SpeechmaticsService (transcription + TTS)
```

### Runtime intelligence flow

Every monitor run and analyst chat turn goes through `ResearchAgentOrchestrator.run`:

```text
1.  Transcribe          — Speechmatics transcribes audio input if present
2.  Memory search       — Cognee graph + self-hosted embedding search for prior context
3.  Previous run fetch  — retrieve prior run's report JSON for change detection baseline
4.  Retrieve context    — rank existing IntelligenceRecords by query relevance; freshness-filtered; T1 sources boosted 1.4×
5.  Live refresh        — if <2 matching records, call Bright Data through GatewayService
6.  Synthesize          — ReportSynthesizer calls LLM with evidence + memory; rule-based fallback
7.  Entity extraction   — second LLM pass extracts real named entities (companies, regulations, products) from synthesis text
8.  Change detection    — ChangeDetectionService diffs current run against previous; produces delta headline + signal diff
9.  Reason              — ReasoningEngine evaluates against org context; produces materiality + recommendations
10. Propose actions     — AutonomousAction records written to DB; require admin approval before execution
11. Entity name update  — generic entity names on evidence records replaced with LLM-extracted company names in-flight
12. Memory upsert       — write synthesis result back to Cognee + self-hosted memory
13. Workflow trigger    — send material signal event to TriggerWare
14. Decision brief      — change-detection-driven headline, what-changed summary, cited evidence, graph context, run receipt
15. AgentRun record     — full ResearchReport JSON persisted to DB including extracted_entities and change_report
```

### Package responsibilities

| Package | Role |
|---|---|
| `packages/agents` | `ResearchAgentOrchestrator` (run loop), `ResearchPlanner` (task decomposition), `ReportSynthesizer` (LLM + rule-based synthesis), `EntityExtractor` (post-synthesis named entity extraction) |
| `packages/brightdata` | Thin `BrightDataClient` wrapping SERP, Web Scraper, Web Unlocker, and Scraping Browser endpoints |
| `packages/gateway` | Self-healing retrieval gateway: failure detection → tool rotation → normalization. Routes: SERP → Web Scraper → Web Unlocker → Scraping Browser |
| `packages/intelligence` | `IntelligenceService`: topic/source/record CRUD, source discovery, evidence refresh, freshness scoring, source quality tiering (T1/T2/T3), Neo4j graph sync, retrieval ranking with tier boost, entity name enrichment backfill |
| `packages/intelligence/change_detection` | `ChangeDetectionService`: diffs current vs previous run; produces `ChangeReport` with new/resolved signals, entity delta, confidence delta, and `delta_headline()` |
| `packages/intelligence/source_quality` | `classify_source_tier(url)` and `boost_score(score, tier)` — URL-based tier classification with T1 (official), T2 (major news), T3 (web) |
| `packages/llm` | `LLMClient`: async OpenAI-compatible client. OpenAI primary → AI/ML API fallback. `available` property gates all LLM paths |
| `packages/reasoning` | `ReasoningEngine`: package-specific frameworks (security/gtm/finance/enterprise), materiality assessments, action proposals. Mock mode when no LLM |
| `packages/memory` | `MemoryProvider`: routes between Cognee and self-hosted. Writes to both; reads Cognee first then merges self-hosted results |
| `packages/partners` | `CogneeMemoryService`, `SpeechmaticsService`, `TriggerWareService` adapters |
| `packages/graph` | `Neo4jGraphClient`: tenant-scoped graph snapshots, entity neighborhoods, enterprise fact projection (products, features, pricing), backfill from evidence records |
| `packages/enterprise` | `IntelligencePack` definitions (security, gtm, finance, enterprise). Packs define default entities, signals, and reasoning framework |
| `packages/schemas` | Pydantic v2 models for all cross-package contracts |
| `packages/common` | `Settings` (pydantic-settings, `.env`-backed), auth, security, RBAC, rate limiting, circuit breaker, logging |
| `packages/observability` | OpenTelemetry wiring, Prometheus metrics (`AGENT_RUNS`, `GATEWAY_LATENCY`, etc.) |

---

## Knowledge Graph

Neo4j makes evidence relationships visible instead of hiding them behind summaries. Every intelligence run writes into a tenant-scoped graph of workspaces, entities, evidence records, sources, signals, actions, and outcomes.

**Node types**: `Workspace`, `Company`, `Vendor`, `Competitor`, `Regulation`, `Supplier`, `Market`, `IntelligenceRecord`, `Source`, `Signal`, `Risk`, `IntelligenceRun`, `WorkflowAction`, `Recommendation`, `Product`, `Feature`, `PricingModel`

**Relationship types**: `MONITORS`, `HAS_RECORD`, `FROM_SOURCE`, `HAS_SIGNAL`, `INDICATES_RISK`, `TRIGGERED_ACTION`, `SUPPORTED_BY`, `OFFERS`, `HAS_FEATURE`, `HAS_PRICING_MODEL`, `CO_OCCURS_WITH`

The frontend graph viewer supports:
- Force-directed canvas layout with physics simulation
- Zoom in/out/fit-all buttons + pinch-to-zoom on touch devices
- Double-click to focus on a node's immediate neighborhood
- Search with live node highlighting and match counter
- Node type filter via dropdown — "All node types" resets, individual types show node counts
- Click to select and inspect any node; detail panel shows summary, confidence, connections
- Smart per-type canvas labels: Source nodes show domain only, Evidence shows entity name, Run nodes show date
- Extracted entity nodes (`DETECTED_ENTITY` edges) written from every run's LLM-extracted named entities

Graph APIs return only tenant-scoped data. Demo graph routes use the demo tenant/session scope and never expose customer data.

---

## Security and Enterprise Readiness

### Authentication

Three runtime modes controlled by `AUTH_MODE`:

| Mode | Purpose |
|---|---|
| `api_key` | Dev/SDK access; `API_AUTH_ENABLED=false` disables all auth in dev |
| `custom` | First-party WebDataOS email/password; JWT signed by `AUTH_JWT_SECRET` |
| `mixed` | Production: accepts WebDataOS sessions, API keys, Clerk JWTs, and unauthenticated public demo routes |

### Managed API Keys

Tenant admins can create named API keys via `POST /api-keys`. Keys use a `wdos_` prefix, are stored as SHA-256 hashes (raw value returned once, never stored), are capped at 20 per tenant, and can be revoked instantly. Managed keys are validated against the database on every request and update `last_used_at` automatically.

### Role-Based Access Control

Every route dependency uses `AuthContext.role`. Admin-only operations raise `403` for `analyst` role:

| Operation | Required role |
|---|---|
| Create workspace | `admin` |
| Create / revoke API key | `admin` |
| Approve action | `admin` |
| Execute action | `admin` |
| Erase tenant (GDPR) | `admin` |

### Audit Logging

Every write operation and sensitive read (`/runs`, `/receipt`, `/agent`, `/intelligence`, `/audit`) is logged to `audit_logs` with:
- `tenant_id`, `principal`, `auth_type`
- `method`, `path`, `status_code`, `duration_ms`
- `ip_address`, `user_agent`

Audit logging is middleware-level — a logging failure never breaks the request.

### GDPR Tenant Erasure

`DELETE /auth/tenants/{tenant_id}` — admin-only, own-tenant-only. Deletes all content data (intelligence records, agent runs, actions, chat messages, memory entries, outcomes, org context, managed API keys, workspaces), anonymizes user accounts, and soft-deletes the tenant. Audit logs are retained for compliance.

### Graceful Degradation

The system degrades by capability, not by failure:

| Missing dependency | Behavior |
|---|---|
| Bright Data credentials | Mock responses in dev; live required in production |
| OpenAI key | AI/ML API fallback; rule-based synthesis if neither is configured |
| Cognee runtime | Self-hosted PostgreSQL + pgvector memory |
| Redis | In-memory rate limiting |
| Neo4j | PostgreSQL-only mode; graph APIs return disabled status |
| Speechmatics | Text-only workflows continue |
| TriggerWare endpoint | Events recorded locally |

---

## Public Demo

The public demo lets buyers, judges, and developers experience the full product loop without signing in.

Demo users can:
- Create a short-lived anonymous session
- Choose a monitoring mission (Vendor Risk, GTM Intelligence, Finance & Market)
- Enter a limited set of entities and signals
- Run a rate-limited monitoring update
- Ask bounded Analyst chat questions
- Inspect sourced evidence
- Explore the knowledge graph
- Read a run receipt explaining exactly what happened

Demo users cannot access tenant workspaces, private history, production workflows, or customer data.

---

## Environment Configuration

```bash
cp .env.example .env
```

Key variables for local dev:

| Variable | Local default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@localhost:5432/webdata` | Async PostgreSQL |
| `MOCK_BRIGHTDATA` | `true` | Skip live Bright Data calls |
| `AUTH_MODE` | `api_key` | Auth mode |
| `API_AUTH_ENABLED` | `false` | Disable auth in dev |
| `NEO4J_ENABLED` | `false` | Skip Neo4j in dev |
| `OPENAI_API_KEY` | unset | LLM (falls back to rule-based) |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Frontend API target |
| `REDIS_URL` | unset | Rate limiting (in-memory fallback) |

Production-only variables:

| Variable | Purpose |
|---|---|
| `AUTH_JWT_SECRET` | Signs first-party WebDataOS sessions |
| `BRIGHTDATA_API_KEY` | Live web retrieval |
| `COGNEE_ENDPOINT`, `COGNEE_API_KEY` | Cognee Cloud (or leave unset for local) |
| `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` | Neo4j Aura or self-hosted |
| `SPEECHMATICS_API_KEY` | Voice input/output |
| `TRIGGERWARE_ENDPOINT`, `TRIGGERWARE_API_KEY` | Workflow delivery |
| `CLERK_JWKS_URL` | Clerk JWT verification (mixed mode) |

Do not commit real secrets. Production credentials belong in Vultr environment variables, Vercel project settings, or a secrets manager.

---

## Local Development

### Option A — Docker Compose (recommended)

```bash
# Core services: PostgreSQL + API + web
docker compose -f infra/docker-compose.yml up --build

# With observability: Prometheus + Grafana
docker compose -f infra/docker-compose.yml --profile monitoring up --build

# Full stack including Neo4j
docker compose -f infra/docker-compose.yml --profile full up --build
```

### Option B — Direct

**Backend**

```bash
python -m venv .venv
source .venv/Scripts/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn apps.api.main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend**

```bash
cd apps/web
npm install
npm run dev     # dev server on http://localhost:5173
```

**Useful commands**

```bash
# Lint
python -m ruff check apps packages tests

# Test suite (40 tests)
python -m pytest -q

# Single test file
python -m pytest tests/test_agent_value_loop.py -q

# Single test by name
python -m pytest -k "test_value_loop_marks_first_successful_run_as_baseline" -q

# DB migrations (local)
alembic upgrade head

# psql
docker compose -f infra/docker-compose.yml exec postgres psql -U postgres -d webdata

# API container shell
docker compose -f infra/docker-compose.yml exec api bash
```

---

## Deployment

| Target | Documentation |
|---|---|
| Vultr full stack | `docs/deployment/VULTR.md` |
| Vercel frontend + Vultr API | `docs/deployment/VERCEL.md` |

**Production deploy (Vultr)**

```bash
docker compose -f infra/docker-compose.yml \
  -f infra/docker-compose.vultr.yml \
  --profile production --profile monitoring \
  up -d --build
```

**Pre-deploy checklist**

```bash
python -m ruff check apps packages tests
python -m pytest -q
cd apps/web && npm run build
```

**Production smoke checks**

```bash
curl http://45.77.89.209/health
curl http://45.77.89.209/ready
curl http://45.77.89.209/demo/catalog
curl http://45.77.89.209/graph/status
```

---

## API Reference

### Health and Runtime

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Runtime health, provider availability, auth mode, demo status |
| `GET` | `/ready` | Readiness probe |
| `GET` | `/metrics` | Prometheus metrics |
| `GET` | `/llm/providers` | LLM provider availability and routing status |
| `GET` | `/llm/aimlapi/models` | AI/ML API model catalog proxy |

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/signup` | Public | Create account and tenant |
| `POST` | `/auth/login` | Public | Authenticate and receive session token |
| `GET` | `/auth/me` | Any | Current authenticated user |
| `DELETE` | `/auth/tenants/{tenant_id}` | Admin | GDPR erasure — delete all tenant content data |

### API Key Management

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api-keys` | Any | List active managed API keys for current tenant |
| `POST` | `/api-keys` | Admin | Create a managed API key (raw value returned once) |
| `DELETE` | `/api-keys/{key_id}` | Admin | Revoke a managed API key |

### Public Demo

| Method | Path | Description |
|---|---|---|
| `GET` | `/demo/catalog` | List demo missions and allowed signals |
| `POST` | `/demo/sessions` | Create a short-lived anonymous demo session |
| `GET` | `/demo/sessions/current` | Resolve the current demo session |
| `POST` | `/demo/workspaces` | Configure a limited demo workspace |
| `POST` | `/demo/monitor/run` | Run a bounded demo monitoring update |
| `POST` | `/demo/analyst/chat` | Ask Analyst questions grounded in demo evidence |
| `GET` | `/demo/evidence` | List evidence for the demo session |
| `GET` | `/demo/graph` | Demo graph snapshot |
| `GET` | `/demo/receipt/{run_id}` | Demo run receipt |
| `GET` | `/demo/runs/latest` | Latest demo run |

### Workspaces and Monitoring

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/workspaces/packages` | Any | List intelligence packages |
| `POST` | `/workspaces` | Admin | Create or update a tenant-scoped workspace |
| `GET` | `/workspaces` | Any | List tenant workspaces |
| `GET` | `/workspaces/{workspace_id}` | Any | Get one workspace |
| `GET` | `/monitor/{workspace_id}` | Any | Get monitoring summary |
| `POST` | `/monitor/{workspace_id}/run` | Any | Trigger a monitoring run |
| `GET` | `/runs` | Any | List agent/monitor runs |
| `GET` | `/runs/{run_id}` | Any | Get run details and decision brief |

### Analyst, Evidence, and Graph

| Method | Path | Description |
|---|---|---|
| `POST` | `/agent/research` | Run a research task and generate a report |
| `GET` | `/chat/{workspace_id}` | Load multi-turn Analyst chat history |
| `POST` | `/chat/{workspace_id}` | Send a multi-turn Analyst chat message |
| `DELETE` | `/chat/{workspace_id}` | Clear workspace chat history |
| `POST` | `/gateway/fetch` | Fetch live evidence through the Bright Data recovery gateway |
| `GET` | `/intelligence/records` | List evidence records with freshness filtering |
| `POST` | `/intelligence/retrieve` | Ranked evidence retrieval |
| `POST` | `/intelligence/retrieval/context` | Ranked evidence context for reasoning |
| `POST` | `/intelligence/topics/{topic_id}/discover` | Discover sources through live search |
| `POST` | `/intelligence/topics/{topic_id}/refresh` | Refresh evidence for a topic |
| `POST` | `/intelligence/topics/{topic_id}/enrich-entities` | Backfill: replace generic entity names with LLM-extracted real names; re-mirrors to Neo4j |
| `GET` | `/graph/status` | Neo4j status and graph counts |
| `GET` | `/graph/topics/{topic_id}` | Graph snapshot for a workspace |
| `POST` | `/graph/topics/{topic_id}/backfill` | Sync evidence into Neo4j |
| `GET` | `/graph/entities/{entity}` | Entity neighborhood graph |
| `GET` | `/graph/cross-entity` | Cross-entity relationship intelligence |
| `GET` | `/graph/signal-timeline/{topic_id}` | Signal timeline for a workspace |
| `GET` | `/graph/risk-posture/{topic_id}` | Risk posture summary |
| `GET` | `/graph/run-lineage/{run_id}` | Run lineage trace |

### Actions, Outcomes, and Partners

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/context` | Any | Upsert organizational context |
| `GET` | `/context/{workspace_id}` | Any | Get organizational context |
| `GET` | `/actions/{workspace_id}` | Any | List autonomous actions |
| `POST` | `/actions/{action_id}/approve` | Admin | Approve or reject an action |
| `POST` | `/actions/{action_id}/execute` | Admin | Execute an approved action |
| `POST` | `/outcomes` | Any | Record a recommendation outcome |
| `GET` | `/outcomes/{workspace_id}` | Any | List workspace outcomes |
| `GET` | `/outcomes/{workspace_id}/stats` | Any | Outcome statistics |
| `POST` | `/transcriptions` | Any | Submit or normalize transcription input |
| `POST` | `/transcriptions/upload` | Any | Upload audio for Speechmatics transcription |
| `POST` | `/speech/synthesize` | Any | Generate spoken response audio |
| `POST` | `/memory/upsert` | Any | Store evidence in memory |
| `POST` | `/memory/search` | Any | Search Cognee/self-hosted memory |
| `POST` | `/workflows/trigger` | Any | Send a workflow event through TriggerWare |
| `GET` | `/triggerware/events` | Any | List recorded TriggerWare events |

---

## SDKs

```bash
# Python SDK
cd sdks/python && python -m build

# TypeScript SDK
cd sdks/typescript && npm install && npm run build
```

---

## Project Structure

```text
apps/
  api/                  FastAPI backend
    main.py             Application entry point, audit middleware, health routes
    dependencies.py     Service wiring, auth resolution, managed key lookup, require_admin
    db/
      models.py         SQLAlchemy models (all tenant-scoped)
      session.py        Async session factory
    routes/             API route handlers
  web/                  React/Vite SPA
    src/main.jsx        Full application UI (~5000 lines; single-file)
packages/
  agents/               Research orchestration and synthesis
  brightdata/           Bright Data API clients
  common/               Settings, auth, security, RBAC, rate limiting, circuit breaker
  enterprise/           Intelligence package definitions
  gateway/              Self-healing retrieval gateway with failure detection
  graph/                Neo4j client, enterprise fact projection, graph snapshots
  intelligence/         Evidence records, topics, freshness, retrieval ranking
  llm/                  OpenAI and AI/ML API routing
  memory/               Cognee and self-hosted PostgreSQL+pgvector memory
  outcomes/             Outcome tracking and analytics
  partners/             Speechmatics, Cognee, TriggerWare adapters
  reasoning/            Materiality assessment and action proposal engine
  schemas/              Pydantic v2 cross-package contracts
  observability/        OpenTelemetry + Prometheus wiring
infra/
  docker-compose.yml    Local and production Compose definitions
  docker-compose.vultr.yml  Vultr-specific overrides
  nginx/                Nginx config
  prometheus/           Prometheus config
  grafana/              Grafana dashboards
alembic/
  versions/             Database migrations (0001–0009)
sdks/
  python/               Python SDK
  typescript/           TypeScript SDK
docs/                   Deployment and product documentation
tests/                  Automated test suite (40 tests, conftest.py for isolation)
```

---

## Data Model

| Table | Purpose |
|---|---|
| `tenants` | Every customer or internal workspace belongs to a tenant |
| `user_accounts` | First-party WebDataOS accounts |
| `tenant_memberships` | Clerk org/user → tenant mappings |
| `topics` | Workspaces: entities, signals, refresh cadence |
| `sources` | Discovered source URLs per workspace (cascade-delete with topic) |
| `intelligence_records` | Extracted evidence with freshness status, optional pgvector embedding, and `source_tier` (1/2/3) |
| `change_events` | Field-level diffs detected between refresh runs |
| `refresh_runs` | Per-topic refresh run records |
| `agent_runs` | Full `ResearchReport` JSON including decision brief |
| `chat_messages` | Durable Analyst conversation history per workspace |
| `memory_entries` | Self-hosted memory with optional pgvector embedding |
| `organizational_contexts` | Per-workspace contracts, risk thresholds, and strategic priorities |
| `autonomous_actions` | Proposed actions with approval workflow (`pending_approval → approved → executed`) |
| `outcomes` | User feedback on recommendations |
| `managed_api_keys` | Tenant-managed API keys with SHA-256 hash storage |
| `audit_logs` | Immutable access and mutation log with principal, path, duration |
| `demo_sessions` | Short-lived anonymous demo sessions |

---

## Requirement Alignment

| Requirement | Status |
|---|---|
| Public demo without sign-in | Implemented with scoped demo sessions and demo-only routes |
| Multi-tenancy | Full tenant isolation on all tables; workspace ID prefixing for non-default tenants |
| RBAC | Enforced on write operations; admin vs. analyst roles checked via dependency |
| Managed API keys | SHA-256 hashed, `wdos_` prefix, max 20/tenant, DB-validated on every request |
| Audit logging | Middleware-level; every write + sensitive read logged; never breaks requests |
| GDPR erasure | `DELETE /auth/tenants/{id}` — wipes content data, anonymizes accounts, retains audit trail |
| Live monitoring dashboard | Implemented via Monitor route and `/monitor/{workspace_id}` |
| Multi-turn Analyst chat | Implemented via `/chat/{workspace_id}` history and message routes |
| Evidence inspector | Evidence list, detail, retrieval context, source tier badges, and graph panels |
| Knowledge graph | Force-directed canvas with zoom, pan, search, highlight, type-filter dropdown, pinch-to-zoom, double-click focus |
| Persistent graph memory | Every run writes to Neo4j; entity and relationship memory accumulates across runs |
| Named entity extraction | Post-synthesis LLM pass; real company/regulation/product names in briefs and graph |
| Change detection | Decision briefs show concrete signal diffs vs previous run, not "no material change" |
| Source quality tiering | T1/T2/T3 classification on all evidence; T1 gets retrieval boost and UI badge |
| Bright Data integration | Live retrieval with self-healing recovery chain |
| LLM provider fallback | OpenAI primary → AI/ML API → rule-based synthesis |
| Cognee integration | Local Cognee deployed; Cloud mode optional |
| pgvector embeddings | Real cosine similarity search in self-hosted memory |
| Redis rate limiting | Per-tenant rate limiting with in-memory fallback |
| Observability | OpenTelemetry + Prometheus + Grafana; `/health` enumerates all provider states |
| Speechmatics | Transcription and TTS adapters implemented |
| TriggerWare | Workflow delivery with local fallback |
| Outcome learning | Database-backed outcome recording and statistics |
| Self-hosted deployment | Vultr full-stack deployment live |
| Hosted frontend | Vercel deployment live |

---

## License

Proprietary. All rights reserved.
