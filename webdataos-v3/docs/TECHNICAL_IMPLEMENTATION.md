# WebDataOS Technical Implementation Document

## 1. System Overview

WebDataOS is implemented as a modular enterprise live-web intelligence platform. The architecture separates the product into seven major layers:

1. Web UI
2. Workspace and package configuration
3. Agent orchestration
4. Intelligence Engine
5. Bright Data Gateway
6. Evidence and record store
7. Developer API and SDK layer

The MVP currently supports mock-live workflows that can be replaced with real Bright Data calls, persistent database storage, and production authentication.

## 2. Current Repository Structure

```text
apps/
  api/                 FastAPI backend
  web/                 React/Vite frontend
  worker/              Background worker entry point
packages/
  agents/              Agent planning, orchestration, and synthesis
  brightdata/          Bright Data client abstraction
  common/              Configuration, logging, security, rate limiting
  enterprise/          Intelligence package definitions
  gateway/             Retrieval, failure detection, recovery, normalization
  intelligence/        Freshness, ranking, context record management
  schemas/             Pydantic schemas
sdks/
  python/              Python SDK
  typescript/          TypeScript SDK
infra/                 Docker, Prometheus, Grafana, OpenTelemetry
alembic/               Database migrations
docs/                  Product and implementation documentation
tests/                 Backend tests
```

## 3. Backend Services

### 3.1 API Layer

The API layer is implemented in `apps/api` using FastAPI.

Important route groups:

- `routes/workspaces.py`
- `routes/agent.py`
- `routes/gateway.py`
- `routes/intelligence.py`
- `routes/runs.py`

Core expected endpoints:

```text
GET  /workspaces/packages
POST /workspaces
GET  /workspaces
GET  /workspaces/{workspace_id}
POST /agent/research
POST /gateway/fetch
POST /context/refresh
GET  /records
GET  /runs
```

### 3.2 Workspace Layer

The workspace layer stores enterprise setup information:

- Workspace name
- Selected package
- Monitored entities
- Signals to watch
- Refresh cadence
- Bright Data route preferences

Implementation files:

```text
packages/schemas/workspace.py
packages/enterprise/packs.py
apps/api/routes/workspaces.py
```

### 3.3 Intelligence Package Layer

Package definitions are stored in `packages/enterprise/packs.py`.

Each package should include:

- `id`
- `name`
- `tier`
- `description`
- `signals`
- `routes`
- `entities`
- `default_prompt`

Supported packages:

- Security & Compliance
- GTM Intelligence
- Finance & Market
- Enterprise Intelligence OS

### 3.4 Agent Orchestration Layer

The agent layer receives a research task and uses workspace configuration to decide how to process it.

Expected flow:

1. Receive request from `/agent/research`.
2. Load workspace and package configuration.
3. Plan the research goal.
4. Ask Intelligence Engine for fresh context.
5. If context is fresh, synthesize answer.
6. If context is stale or missing, call Gateway.
7. Synthesize sourced brief from evidence.
8. Store run trace and return output.

Implementation files:

```text
packages/agents/planner.py
packages/agents/orchestrator.py
packages/agents/synthesizer.py
packages/schemas/agent.py
apps/api/routes/agent.py
```

### 3.5 Intelligence Engine

The Intelligence Engine manages stored records and freshness decisions.

Responsibilities:

- Store and retrieve records
- Evaluate freshness
- Rank candidate records
- Mark records as used, refreshed, stale, skipped, or updated
- Return context package to agent

Implementation files:

```text
packages/intelligence/service.py
packages/intelligence/utils.py
packages/schemas/intelligence.py
apps/api/routes/intelligence.py
```

Expected context package shape:

```json
{
  "workspace_id": "ws_live_001",
  "package_id": "enterprise",
  "records_used": 8,
  "records_refreshed": 3,
  "records_skipped": 1,
  "freshness_policy": "7d",
  "evidence_sources": 12,
  "confidence": 0.87
}
```

### 3.6 Bright Data Gateway

The Gateway is the last-mile execution layer. It should abstract Bright Data products and provide resilient retrieval.

Responsibilities:

- Receive retrieval request
- Select correct Bright Data route
- Detect failure mode
- Retry using fallback route
- Normalize result into clean JSON
- Generate recovery receipt

Implementation files:

```text
packages/brightdata/client.py
packages/brightdata/models.py
packages/gateway/service.py
packages/gateway/failure_detector.py
packages/gateway/recovery.py
packages/gateway/normalizer.py
apps/api/routes/gateway.py
```

Bright Data routes:

- SERP API for source discovery
- Web Unlocker for blocked pages
- Scraping Browser for JavaScript-heavy sites
- Web Scraper API for structured JSON
- MCP Server for agent connectivity
- Proxies for reliable access at scale

Expected receipt shape:

```json
{
  "status": "success",
  "package": "Enterprise Intelligence OS",
  "initial_tool": "serp_api",
  "recovery_path": ["serp_success", "scraper_normalized"],
  "tool_used": "web_scraper_api",
  "confidence": 0.9,
  "output": "clean_json"
}
```

## 4. Frontend Implementation

The frontend is implemented in `apps/web` using React and Vite.

Required pages:

- Landing
- Setup
- Workspace
- Agent
- Intelligence
- Gateway
- Developer
- Architecture
- Demo

### 4.1 Landing Page

Purpose:

- Explain product positioning
- Show the live-web intelligence loop
- Present intelligence packages
- Move users to Setup

### 4.2 Setup Page

Purpose:

- Select package
- Configure workspace
- Enter entities and signals
- Select refresh cadence

### 4.3 Workspace Page

Purpose:

- Show selected package
- Show monitored entities
- Show watched signals
- Navigate to Agent, Intelligence, and Gateway pages

### 4.4 Agent Page

Purpose:

- Mock-live chat-style research surface
- Show run history
- Show sourced brief
- Show trace and evidence inspector

### 4.5 Intelligence Page

Purpose:

- Show context records
- Show freshness status
- Refresh stale records
- Show JSON context package

### 4.6 Gateway Page

Purpose:

- Show Bright Data route configuration
- Simulate retrieval/recovery
- Show recovery receipt

### 4.7 Developer Page

Purpose:

- Show API endpoints
- Show SDK usage direction
- Explain integration surfaces

## 5. Data Model

### Workspace

```json
{
  "id": "ws_live_001",
  "name": "Enterprise Intelligence Workspace",
  "package_id": "enterprise",
  "entities": ["Okta", "Stripe", "HubSpot"],
  "signals": ["Breach exposure", "Regulatory updates"],
  "cadence": "daily",
  "created_at": "timestamp"
}
```

### Intelligence Record

```json
{
  "id": "rec_001",
  "workspace_id": "ws_live_001",
  "entity": "Okta",
  "type": "security_policy_page",
  "freshness": "fresh",
  "score": 0.91,
  "status": "used",
  "summary": "Fresh record with current evidence.",
  "source_url": "https://example.com",
  "retrieved_at": "timestamp"
}
```

### Agent Run

```json
{
  "id": "run_001",
  "workspace_id": "ws_live_001",
  "package_id": "enterprise",
  "prompt": "Assess vendor risk.",
  "status": "completed",
  "events": [],
  "sources": [],
  "answer": "Sourced intelligence brief."
}
```

### Gateway Job

```json
{
  "id": "gw_001",
  "workspace_id": "ws_live_001",
  "route": "scraping_browser",
  "status": "success",
  "failure_mode": "javascript_required",
  "recovery_path": ["web_scraper_api", "scraping_browser"],
  "normalized_output": {}
}
```

## 6. Integration Sequence

### Phase 1: Stabilize MVP

- Ensure UI compiles
- Ensure backend tests pass
- Ensure all package definitions are used consistently
- Ensure mock mode works end-to-end

### Phase 2: Persist Workspace Data

- Add database-backed workspaces
- Add database-backed package configuration
- Add database-backed intelligence records
- Add run persistence

### Phase 3: Wire Bright Data

- Add Bright Data API keys through environment variables
- Implement SERP route
- Implement Web Scraper API route
- Implement Scraping Browser fallback
- Implement Web Unlocker fallback
- Store gateway receipts

### Phase 4: Add Scheduling

- Add worker jobs for refresh cadence
- Add stale record detection
- Add scheduled monitoring runs
- Add alert generation

### Phase 5: Enterprise Hardening

- Authentication
- Multi-tenant isolation
- Role-based access control
- API key management
- Audit logs
- Billing hooks
- Deployment runbooks

## 7. Testing Requirements

### Backend Tests

- Workspace creation
- Package listing
- Agent research request validation
- Gateway failure detection
- Gateway recovery route selection
- Intelligence freshness evaluation

### Frontend Tests

- Landing renders
- Package selection updates state
- Setup form updates workspace
- Agent can create mock run
- Intelligence can refresh stale record
- Gateway can simulate recovery

### Integration Tests

- Workspace setup to agent run
- Agent run to intelligence context
- Intelligence stale record to gateway refresh
- Gateway receipt to stored evidence

## 8. Production Deployment Requirements

- Dockerized API service
- Dockerized web frontend
- Background worker
- PostgreSQL database
- Redis or queue backend for jobs
- Prometheus metrics
- Grafana dashboard
- OpenTelemetry traces
- Secret management for Bright Data keys
- CI pipeline for tests

## 9. Environment Variables

Expected environment variables:

```text
DATABASE_URL=
BRIGHTDATA_API_KEY=
BRIGHTDATA_SERP_ZONE=
BRIGHTDATA_UNLOCKER_ZONE=
BRIGHTDATA_BROWSER_ZONE=
BRIGHTDATA_SCRAPER_API_KEY=
API_SECRET_KEY=
ENVIRONMENT=development
```

## 10. Definition of Done

The codebase is ready for enterprise demo when:

- UI builds successfully
- Backend tests pass
- Workspace APIs work
- Package APIs work
- Agent research accepts workspace and package context
- Intelligence records can refresh
- Gateway returns structured recovery receipts
- Docs include BRD and technical implementation details
- README explains how to run locally

## Partner Runtime Technical Implementation

### Runtime Path

```text
User text / voice / audio
  -> Speechmatics transcription service
  -> Cognee memory search
  -> Bright Data live-web retrieval and recovery
  -> Cognee memory upsert
  -> TriggerWare workflow trigger
  -> WebDataOS response: brief + JSON + partner trace
```

### New Backend Modules

```text
packages/partners/speechmatics.py
packages/partners/cognee.py
packages/partners/triggerware.py
packages/schemas/partners.py
apps/api/routes/partners.py
```

### New API Endpoints

```http
POST /transcriptions
POST /memory/upsert
POST /memory/search
POST /workflows/trigger
```

### Updated Agent Request Contract

`POST /agent/research` now accepts:

```json
{
  "task": "Check vendor risk and trigger a review if needed",
  "workspace_id": "workspace_enterprise",
  "package_id": "enterprise",
  "input_mode": "voice",
  "audio_url": "https://example.com/vendor-call.mp3",
  "transcript_text": "optional mock transcript",
  "enable_memory": true,
  "enable_workflows": true
}
```

### Updated Agent Response Contract

`ResearchReport` now returns:

```json
{
  "transcript": { "provider": "speechmatics", "transcript_id": "tr_..." },
  "memories_used": [{ "provider": "cognee", "memory_id": "mem_..." }],
  "workflow_events": [{ "provider": "triggerware", "event_id": "tw_..." }],
  "partner_trace": [
    "speechmatics.transcribe",
    "cognee.memory.search",
    "brightdata.gateway.refresh",
    "cognee.memory.upsert",
    "triggerware.workflow.trigger"
  ]
}
```

### Environment Variables

```bash
SPEECHMATICS_API_KEY=
SPEECHMATICS_ENDPOINT=
COGNEE_API_KEY=
COGNEE_ENDPOINT=
TRIGGERWARE_API_KEY=
TRIGGERWARE_ENDPOINT=
```

### Mock-Safe Production Pattern

The current implementation uses stable adapter classes so the product can run without external keys during local demos. Production wiring should replace the mock internals of each adapter while preserving these method contracts:

```python
SpeechmaticsService.transcribe(request)
CogneeMemoryService.search(request)
CogneeMemoryService.upsert(request)
TriggerWareService.trigger(request)
```

### Testing

A new test file validates the partner runtime adapters:

```text
tests/test_partner_runtime.py
```

The tests verify mock transcription, memory upsert/search, and workflow trigger behaviour.
