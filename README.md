# WebDataOS — Enterprise Live-Web Intelligence Runtime

**WebDataOS** is an enterprise intelligence platform that turns public web signals into fresh, structured, evidence-backed intelligence. It serves both developers (via REST API and SDKs) and business users (via web interface) across three intelligence domains: Security & Compliance, GTM Intelligence, and Finance & Market Intelligence.

The system is built on a partner runtime architecture where each integration has a single, non-overlapping responsibility:

| Partner | Role | What it does |
|---------|------|-------------|
| **Bright Data** | Web → Evidence | SERP API, Web Unlocker, Scraping Browser, Web Scraper API. Self-healing gateway with failure detection and recovery routing. |
| **Speechmatics** | Voice → Transcript | Converts spoken requests and uploaded audio into structured text before enrichment. |
| **Cognee** | Memory → Knowledge Graph | Open-source knowledge graph memory. `remember()` stores, `recall()` searches with graph reasoning. Local or Cloud. |
| **Self-hosted Memory** | Memory → Vector Store | PostgreSQL + OpenAI embeddings for semantic search. Fallback when Cognee is unavailable. Zero vendor lock-in. |
| **TriggerWare** | Signal → Action | Material changes fire alerts, review tasks, and downstream workflow automations. |
| **OpenAI** | Evidence → Intelligence | LLM-powered synthesis and embedding generation for semantic memory search. |
| **Neo4j** | Entity → Graph | Entity relationship storage for intelligence records. Free tier available via Aura. |

---

## Architecture

```
User (text / voice / audio upload)
  │
  ├── Speechmatics ──► Transcription
  │
  ├── Memory Service ──► Check prior evidence (semantic search via embeddings)
  │
  ├── Intelligence Engine ──► Retrieve existing records, check freshness
  │   │
  │   └── Bright Data Gateway ──► SERP → Web Scraper → Scraping Browser → Web Unlocker
  │       │                       (self-healing: FailureDetector → RecoveryRouter)
  │       └── ResultNormalizer ──► Clean JSON + evidence records
  │
  ├── LLM Synthesizer ──► Contextual analysis (OpenAI) with memory context
  │
  ├── Reasoning Engine (v2) ──► Materiality assessment against org context
  │   └── Autonomous Actions ──► Proposals with human approval gates
  │
  ├── Memory Service ──► Store new evidence for future runs
  │
  └── TriggerWare ──► Fire workflow actions for material signals
```

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- (Optional) OpenAI API key for LLM synthesis and semantic memory search
- (Optional) Bright Data API credentials for live web retrieval

### 1. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Required for LLM-powered synthesis, semantic memory, and Cognee
OPENAI_API_KEY=sk-...

# Required for live web retrieval (mock mode when empty)
BRIGHTDATA_API_KEY=...
BRIGHTDATA_SERP_ENDPOINT=https://api.brightdata.com/request
BRIGHTDATA_WEB_SCRAPER_ENDPOINT=https://api.brightdata.com/datasets/v3/scrape?dataset_id=YOUR_DATASET_ID&format=json
BRIGHTDATA_WEB_UNLOCKER_ENDPOINT=https://api.brightdata.com/request
BRIGHTDATA_SCRAPING_BROWSER_ENDPOINT=wss://brd.superproxy.io:9222
BRIGHTDATA_MCP_ENDPOINT=https://your-mcp-server-endpoint

# Cognee Cloud (optional — local mode works without these)
COGNEE_ENDPOINT=https://your-instance.cognee.ai
COGNEE_API_KEY=ck_...

# Neo4j (optional — free tier: neo4j.com/cloud/aura-free)
NEO4J_ENABLED=true
NEO4J_URI=neo4j+s://xxxxxxxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password

# Database (defaults work with Docker Compose)
DATABASE_URL=postgresql+asyncpg://webdata:webdata@db:5432/webdata

# API authentication
API_KEY=your-api-key-here
```

### 2. Start services

```bash
docker compose -f infra/docker-compose.yml up --build
```

This starts: API (port 8000), Web UI (port 3000), PostgreSQL (5432), Neo4j (7474), Prometheus (9090), Grafana (3001).

### 3. Verify

```bash
curl http://localhost:8000/health
```

### 4. Create a workspace and run research

```bash
# List available intelligence packages
curl http://localhost:8000/workspaces/packages \
  -H "X-API-Key: your-api-key-here"

# Create a workspace
curl -X POST http://localhost:8000/workspaces \
  -H "X-API-Key: your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Enterprise Workspace",
    "package_id": "enterprise",
    "entities": ["Okta", "Stripe", "HubSpot"],
    "signals": ["vendor_risk", "pricing_change", "regulatory_change"],
    "refresh_frequency_minutes": 1440
  }'

# Run a research task
curl -X POST http://localhost:8000/agent/research \
  -H "X-API-Key: your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Assess current vendor risk and pricing signals",
    "workspace_id": "enterprise_workspace",
    "package_id": "enterprise",
    "input_mode": "text",
    "enable_memory": true,
    "enable_workflows": true
  }'
```

---

## Local Development (without Docker)

```bash
# Backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn apps.api.main:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd apps/web
npm install
npm run dev
```

---

## Intelligence Packages

| Package | Entities | Signals | Bright Data Routes | Output Focus |
|---------|----------|---------|-------------------|-------------|
| **Security & Compliance** | Vendors, Regulators, Domains, Security pages | Vendor risk, Regulatory change, Breach exposure, Compliance | serp_api, web_unlocker, scraping_browser, web_scraper_api | Risk brief, Evidence, Recommended action |
| **GTM Intelligence** | Competitors, Accounts, Products, Markets | Competitor moves, Pricing changes, Messaging shifts, Buying signals | serp_api, web_scraper_api, scraping_browser, mcp_server | Market brief, Account intelligence, Competitive change |
| **Finance & Market** | Companies, Suppliers, Sectors, Market pages | Filings, Supplier signals, Market movement, Alternative data | serp_api, web_scraper_api, scraping_browser, proxies | Market signal, Company brief, Supplier risk |
| **Enterprise Intelligence OS** | All of the above | All of the above | All 5 routes | Executive brief, Cross-track alerts, Shared evidence |

---

## Memory Architecture

WebDataOS uses a dual memory system — Cognee for knowledge graph memory and a self-hosted vector store for embedding-backed search. Both write on upsert; search merges results from both.

### Cognee (Primary — Knowledge Graph)

Cognee is open source (`pip install cognee`). It provides `remember()`, `recall()`, and `forget()` operations backed by a knowledge graph that captures entity relationships, reasoning patterns, and evidence chains.

**Local mode** (default): Cognee runs locally with the installed package. Requires `LLM_API_KEY` (set automatically from `OPENAI_API_KEY`).

**Cloud mode**: Set `COGNEE_ENDPOINT` and `COGNEE_API_KEY` to connect to Cognee Cloud.

### Self-Hosted (Fallback — Vector Store)

When Cognee is not installed, the system falls back to a self-hosted memory service:

- **With OPENAI_API_KEY**: Content embedded via `text-embedding-3-small`, stored in PostgreSQL, searched by cosine similarity.
- **Without OPENAI_API_KEY**: Keyword matching against entity names and content text.

### Neo4j (Graph Database)

The intelligence engine stores evidence records in Neo4j for entity relationship queries. Configure with:

```env
NEO4J_ENABLED=true
NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password
```

Neo4j Aura Free tier: up to 200K nodes, 400K relationships, auto-deleted after 30 days of inactivity.

### Graceful Degradation

| Component | With it | Without it |
|-----------|---------|------------|
| Cognee (`pip install cognee`) | Knowledge graph memory with `remember`/`recall` | Skipped, self-hosted only |
| `COGNEE_ENDPOINT` + `COGNEE_API_KEY` | Cognee Cloud (managed) | Cognee local (self-hosted) |
| `OPENAI_API_KEY` | LLM synthesis + semantic memory search | Rule-based synthesis + keyword search |
| `NEO4J_ENABLED=true` | Entity relationship graph | PostgreSQL-only storage |
| `BRIGHTDATA_*` | Live web retrieval with recovery | Mock gateway responses |

---

## Bright Data Self-Healing Gateway

The gateway detects failure types and automatically routes to the next Bright Data tool:

| Failure Type | Recovery Route |
|-------------|---------------|
| `blocked`, `captcha`, `geo_blocked`, `rate_limited` | Web Unlocker → Scraping Browser |
| `javascript_required`, `empty_response`, `selector_failed` | Scraping Browser → Web Unlocker |
| `web_scraper_api` failure | Scraping Browser |
| `scraping_browser` failure | Web Unlocker |

Every fetch attempt is logged with tool used, failure type, latency, and recovery path. The full path is returned in the `GatewayFetchResponse`.

---

## v2 Capabilities

### Organizational Context (Phase 1)
Store contracts, risk thresholds, financial exposure, renewal calendar, strategic priorities, and compliance requirements per workspace. The reasoning engine uses this context to assess materiality.

### LLM-Backed Reasoning (Phase 2)
Package-specific reasoning frameworks evaluate evidence against organizational context. Each finding gets a materiality rating (critical/high/medium/low/informational), impact description, financial impact estimate, and urgency assessment.

### Autonomous Actions (Phase 3)
The system proposes concrete actions: draft emails, schedule reviews, update risk registers, notify teams. High-stakes actions require human approval. Low-risk actions auto-approve.

### Outcome Learning (Phase 4)
Record what happened after each recommendation. The system tracks hit rate, signal accuracy, and entity accuracy to improve future materiality scoring.

---

## API Reference

### Core Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check with partner status |
| `GET` | `/workspaces/packages` | List intelligence packages |
| `POST` | `/workspaces` | Create workspace |
| `GET` | `/workspaces` | List workspaces |
| `GET` | `/workspaces/{id}` | Get workspace details |
| `POST` | `/agent/research` | Run LLM-powered research task |
| `POST` | `/gateway/fetch` | Self-healing Bright Data fetch |
| `POST` | `/intelligence/topics` | Create topic |
| `POST` | `/intelligence/topics/{id}/discover` | Discover sources via SERP |
| `POST` | `/intelligence/topics/{id}/refresh` | Refresh topic records |
| `GET` | `/intelligence/records` | List evidence records |
| `POST` | `/intelligence/retrieval/context` | Retrieve ranked context |
| `POST` | `/transcriptions` | Speechmatics transcription |
| `POST` | `/memory/upsert` | Store evidence memory |
| `POST` | `/memory/search` | Semantic memory search |
| `POST` | `/workflows/trigger` | TriggerWare workflow |
| `GET` | `/runs` | List agent runs |
| `GET` | `/runs/{id}` | Get run details + report |
| `GET` | `/metrics` | Prometheus metrics |

### v2 Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/context` | Upsert organizational context |
| `GET` | `/context/{workspace_id}` | Get organizational context |
| `GET` | `/actions/{workspace_id}` | List autonomous actions |
| `POST` | `/actions/{id}/approve` | Approve or reject action |
| `POST` | `/actions/{id}/execute` | Execute approved action |
| `POST` | `/outcomes` | Record outcome |
| `GET` | `/outcomes/{workspace_id}` | List outcomes |
| `GET` | `/outcomes/{workspace_id}/stats` | Outcome stats |

---

## Project Structure

```
├── apps/
│   ├── api/                  # FastAPI backend
│   │   ├── main.py           # App entry point
│   │   ├── dependencies.py   # Service wiring
│   │   ├── db/               # SQLAlchemy models & session
│   │   └── routes/           # API route handlers
│   └── web/                  # Vite + React + TypeScript frontend
│       └── src/main.tsx      # Single-file React app
├── packages/
│   ├── agents/               # Orchestrator, planner, synthesizer
│   ├── enterprise/           # Intelligence package definitions
│   ├── gateway/              # Bright Data self-healing gateway
│   ├── intelligence/         # Evidence records, topics, retrieval
│   ├── llm/                  # OpenAI chat client
│   ├── memory/               # Dual memory: Cognee (graph) + self-hosted (vectors)
│   │   ├── provider.py       # Smart router: Cognee primary, self-hosted fallback
│   │   ├── service.py        # Self-hosted memory with embeddings
│   │   └── embeddings.py     # OpenAI embedding client
│   ├── outcomes/             # Outcome tracking service
│   ├── reasoning/            # Reasoning engine + frameworks
│   ├── schemas/              # Pydantic models
│   └── partners/             # Speechmatics, Cognee, TriggerWare adapters
├── infra/                    # Docker Compose, Prometheus, Grafana
├── tests/                    # Test suite
└── docs/                     # BRD and documentation
```

---

## Graceful Degradation

Every layer degrades gracefully based on available credentials:

| Credential | With it | Without it |
|-----------|---------|------------|
| `cognee` package | Knowledge graph memory via `remember`/`recall` | Self-hosted memory only |
| `COGNEE_ENDPOINT` + `COGNEE_API_KEY` | Cognee Cloud (managed) | Cognee local |
| `OPENAI_API_KEY` | LLM synthesis + semantic memory search | Rule-based synthesis + keyword search |
| `NEO4J_ENABLED=true` | Entity relationship graph | PostgreSQL-only storage |
| `BRIGHTDATA_*` | Live public web retrieval with recovery routing | Mock gateway responses |
| `DATABASE_URL` | Persistent storage | In-memory fallback |

The system runs at whatever level of integration the environment supports.

---

## License

Proprietary. All rights reserved.
