# Implementation Sequence

1. Build Track 3 Gateway first.
   - Bright Data wrappers
   - Failure detection
   - Recovery router
   - Clean JSON output
   - Receipts/traces/metrics

2. Build Track 2 Intelligence Layer.
   - Topic registry
   - Source discovery
   - Structured records
   - Freshness/change detection
   - Context-aware retrieval
   - Neo4j graph projection

3. Build Track 1 Agent.
   - Planner
   - Retrieval-first context check
   - Live refresh when stale/missing
   - Reasoning and synthesis
   - Sourced final report

4. Build frontend dashboard.
   - Research console
   - Agent plan
   - Intelligence records
   - Gateway recovery trace

5. Build deployment and observability.
   - Docker Compose
   - Prometheus metrics
   - OpenTelemetry traces
   - Grafana dashboard placeholder

## Production hardening pass added

- API key authentication and local/dev bypass switch.
- Rate limiting and request body size guard.
- Bright Data retry, timeout, and circuit-breaker handling.
- Alembic migration scaffold.
- CI workflow for Python and TypeScript SDK.
- Production deployment checklist and API key documentation.
- SDK endpoint alignment with `/intelligence/*` API routes.

## Next sequence: tenancy, demo, and graph UX

Follow `TENANCY_DEMO_GRAPH_PLAN.md` before implementation.

Local-first order:

1. Add tenant schema changes and migrations.
2. Add tenant-aware authentication context.
3. Add Clerk JWT verification behind a feature flag.
4. Scope workspace, evidence, run, chat, memory, action, outcome, and graph queries by tenant.
5. Add public demo sessions and rate-limited demo routes.
6. Add demo mission setup and bounded Analyst chat.
7. Add tenant-scoped graph snapshots and graph backfill controls.
8. Add frontend Clerk sign-in/sign-up, tenant workspace routing, public demo entry, and graph inspector.
9. Prove isolation and demo boundaries with tests.
10. Push and deploy only after local API, frontend, and tests pass.
