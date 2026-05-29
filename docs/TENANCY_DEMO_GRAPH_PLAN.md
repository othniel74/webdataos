# Tenancy, Public Demo, and Knowledge Graph Plan

This document defines the next implementation milestone for WebDataOS: move from a single shared sign-in into a tenant-safe product, while preserving a real public demo that judges, buyers, and developers can experience without signing in.

## Objective

WebDataOS should support two clear operating modes:

1. **Public demo mode**: a real, limited, safe product experience without sign-in.
2. **Authenticated tenant mode**: Clerk-backed sign-in/sign-up with organization-level isolation.

Both modes must demonstrate the same value loop:

```text
Configure monitoring scope
  -> collect live or cached-live evidence
  -> save evidence records
  -> compare against previous state
  -> reason over business impact
  -> propose actions
  -> show workflow and outcome receipt
  -> expose graph relationships
```

The demo must not be a fake marketing walkthrough. It should let visitors feel how the system works while protecting production data, provider spend, and workflow integrations.

## Current Gap

The current application has one broad sign-in state and API-key based backend access. That is not enough for an enterprise product because:

- customer data is not yet explicitly scoped by tenant;
- user roles are not modeled;
- public demo usage is not separated from authenticated customer usage;
- secrets and integrations are not isolated by organization;
- graph data can become confusing if all workspaces share one graph namespace.

## Target Product Model

### Public Demo Mode

Public demo users should be able to:

- open a demo without signing in;
- choose a preset mission:
  - Vendor Risk and Compliance;
  - Competitor and GTM Intelligence;
  - Market and Finance Signals;
- enter a small number of entities to monitor;
- select signal types;
- run a rate-limited demo update;
- ask the Analyst chat questions grounded only in demo evidence;
- inspect evidence, graph relationships, recommendations, actions, and the run receipt.

Public demo users should not be able to:

- access customer workspaces;
- add or view API keys;
- change production integrations;
- trigger real external workflows;
- save permanent private workspaces;
- run unlimited live retrieval or LLM calls;
- see another visitor's demo session.

Recommended public demo behavior:

- create a short-lived `demo_session_id`;
- create or reuse a scoped demo workspace;
- use cached-live evidence by default;
- allow a rate-limited "refresh demo" action;
- ground Analyst chat in that demo session's evidence only;
- expire demo sessions after a defined retention window, such as 24 hours.

### Authenticated Tenant Mode

Authenticated users should sign in through Clerk and operate inside an organization.

Core identity fields:

| Field | Purpose |
| --- | --- |
| `tenant_id` | Internal WebDataOS tenant boundary. |
| `clerk_user_id` | Clerk user identifier. |
| `clerk_org_id` | Clerk organization identifier when organization mode is used. |
| `workspace_id` | Workspace within the tenant. |
| `role` | Owner, admin, analyst, or viewer. |

Recommended roles:

| Role | Capability |
| --- | --- |
| Owner | Manage tenant, billing, integrations, users, and all workspaces. |
| Admin | Manage workspaces, context, and operational settings. |
| Analyst | Run monitoring, chat with Analyst, inspect evidence, propose actions. |
| Viewer | Read reports, evidence, graph, actions, and outcomes. |

## Backend Tenancy Requirements

Every customer-facing table should be tenant-scoped.

Tables that need tenant scope:

- `topics`
- `sources`
- `intelligence_records`
- `change_events`
- `refresh_runs`
- `agent_runs`
- `chat_messages`
- `memory_entries`
- `organizational_contexts`
- `autonomous_actions`
- `outcomes`

Implementation approach:

1. Add `tenant_id` to tenant-owned tables.
2. Backfill existing production data into an internal/default tenant.
3. Add indexes for common tenant queries, for example `(tenant_id, workspace_id)` and `(tenant_id, created_at)`.
4. Update every route dependency to resolve an authenticated context containing `tenant_id`, `user_id`, `org_id`, and role.
5. Ensure all reads and writes filter by `tenant_id`.
6. Add tests proving one tenant cannot read another tenant's records, runs, chat history, actions, outcomes, or graph.

The existing API-key auth can remain for internal service access, local development, and controlled demo API access, but it should not be the primary customer identity system.

## Clerk Integration Plan

The current frontend is Vite/React, so the local implementation should use Clerk's React SDK. If the app later moves to Next.js, the frontend SDK can change while the backend tenancy model remains the same.

Frontend responsibilities:

- initialize Clerk provider;
- expose sign-in and sign-up screens;
- support Clerk organizations if enabled;
- send the Clerk session token with API requests;
- route unauthenticated visitors to the public demo or sign-in;
- hide tenant-only navigation from demo users.

Backend responsibilities:

- verify Clerk JWTs through Clerk JWKS;
- map Clerk identity to a WebDataOS tenant;
- create tenant membership records on first sign-in where appropriate;
- enforce role-based authorization;
- reject requests that lack tenant scope except for approved public demo routes.

Suggested environment variables:

| Variable | Purpose |
| --- | --- |
| `CLERK_PUBLISHABLE_KEY` | Frontend Clerk publishable key. |
| `CLERK_SECRET_KEY` | Backend Clerk secret key. |
| `CLERK_JWKS_URL` | JWKS endpoint used for JWT verification. |
| `CLERK_ISSUER` | Expected JWT issuer. |
| `AUTH_MODE` | `api_key`, `clerk`, or `mixed` during transition. |
| `PUBLIC_DEMO_ENABLED` | Enables demo routes and demo UI. |
| `DEMO_TENANT_ID` | Dedicated tenant for demo activity. |
| `DEMO_RATE_LIMIT_PER_HOUR` | Controls demo run cost and abuse. |

## Public Demo API Boundary

Public demo routes should be explicit instead of exposing all normal tenant routes anonymously.

Suggested routes:

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/demo/sessions` | Create anonymous short-lived demo session. |
| `GET` | `/demo/catalog` | List preset demo missions and signal types. |
| `POST` | `/demo/workspaces` | Create/update limited demo workspace scope. |
| `POST` | `/demo/monitor/run` | Run a rate-limited demo monitor update. |
| `POST` | `/demo/analyst/chat` | Ask Analyst questions grounded in demo evidence. |
| `GET` | `/demo/evidence` | List evidence for the current demo session. |
| `GET` | `/demo/graph` | Return graph snapshot for demo evidence. |
| `GET` | `/demo/receipt/{run_id}` | Show run receipt and value loop proof. |

Demo routes should write records using the demo tenant/session scope and should never call customer tenant routes internally without that scope.

## Analyst Chat in Demo Mode

The demo Analyst should be interactive, but bounded.

Allowed:

- ask follow-up questions about demo evidence;
- ask why a signal matters;
- ask which action should happen next;
- ask for source-backed summaries;
- ask for graph relationships around a selected entity.

Not allowed:

- arbitrary general-purpose chat;
- access to private tenant history;
- unlimited LLM calls;
- workflow execution;
- changing provider credentials.

The Analyst response should always include:

- answer;
- evidence used;
- confidence or limitation;
- receipt/run reference when available.

## Knowledge Graph Frontend Plan

The knowledge graph should make Neo4j visible as a trust and reasoning layer, not just a health badge.

### What the Graph Shows

Graph node types:

| Node | Meaning |
| --- | --- |
| Workspace | Monitoring scope. |
| Entity | Vendor, competitor, regulator, account, product, domain, or market. |
| Source | URL or external source found by the gateway. |
| Evidence | Saved intelligence record. |
| Signal | Detected signal type. |
| Recommendation | Reasoned recommendation. |
| Action | Proposed or approved action. |
| Outcome | Recorded result after action. |

Graph relationship types:

| Relationship | Meaning |
| --- | --- |
| `MONITORS` | Workspace monitors an entity or signal. |
| `FOUND_SOURCE` | Workspace/source discovery found a URL. |
| `EXTRACTED_EVIDENCE` | Source produced evidence. |
| `DETECTED_SIGNAL` | Evidence supports a signal type. |
| `SUPPORTS_RECOMMENDATION` | Evidence supports a recommendation. |
| `PROPOSED_ACTION` | Recommendation produced an action. |
| `TRIGGERED_WORKFLOW` | Action or run triggered workflow delivery. |
| `RECORDED_OUTCOME` | Action or recommendation produced an outcome. |

### Where It Appears

Recommended frontend placements:

1. **Monitor page**: small "relationship map" beside the latest run receipt.
2. **Evidence page**: main graph inspector for selected evidence/entity.
3. **Analyst chat**: optional cited graph context in responses.
4. **Settings/Developer**: graph health, backfill, and sync controls.

### Interaction Design

Users should be able to:

- click an evidence record and see its graph neighborhood;
- click an entity node and see related sources, evidence, actions, and outcomes;
- click a recommendation and see the evidence chain behind it;
- filter graph by fresh records only;
- see stale graph data clearly marked or excluded;
- sync/backfill graph when Neo4j is available.

The graph should not replace the evidence list. It should explain relationships and lineage.

## Data Isolation for Graph

Neo4j data must be tenant-scoped.

Every graph node should include:

- `tenant_id`;
- `workspace_id`;
- stable node id;
- node type;
- freshness timestamp where relevant.

Every graph query must include `tenant_id`.

Demo graph queries must use the demo tenant/session scope only.

## Local-First Implementation Sequence

The implementation should be developed and verified locally before any GitHub push or Vultr/Vercel deployment.

1. Add tenant schema changes and migrations.
2. Add tenant-aware auth context.
3. Add Clerk JWT verification behind a feature flag.
4. Add tenant scoping to backend routes.
5. Add demo session model and public demo routes.
6. Add demo workspace configuration and Analyst chat boundary.
7. Add graph tenant scoping and graph snapshot APIs.
8. Add frontend Clerk sign-in/sign-up and organization selection.
9. Add public demo entry, demo mission setup, demo Analyst chat, and demo graph.
10. Add tests for tenant isolation, demo isolation, graph scoping, and route permissions.
11. Run local API and frontend verification.
12. Push to GitHub only after local checks pass.
13. Deploy to Vultr/Vercel only after the pushed commit is verified.

## Acceptance Criteria

Local implementation is acceptable when:

- unauthenticated visitors can open the public demo;
- demo visitors can choose a mission, entities, and signal types;
- demo visitors can run a limited update or replay cached-live evidence;
- demo Analyst chat responds only from demo evidence;
- signed-in Clerk users can create tenant workspaces;
- users cannot access another tenant's data;
- tenant users can see Monitor, Evidence, Analyst, Actions, Outcomes, and Settings for their tenant only;
- graph views show tenant-scoped relationships;
- demo graph never exposes customer data;
- tests prove tenant isolation and demo boundaries;
- no route returns stale records as current evidence without marking them stale;
- the full value loop receipt remains visible.

## Open Decisions

These should be confirmed before implementation:

1. Should Clerk organizations be mandatory from day one, or should solo users get an automatic personal tenant?
2. Should public demo refresh use live providers every time, or cached-live evidence with a rate-limited live refresh button?
3. What demo retention window should be used: 1 hour, 24 hours, or 7 days?
4. Should TriggerWare be disabled in demo mode, or replaced with simulated workflow receipts?
5. Should graph visualization start as a compact relationship map or a full dedicated graph page?

Recommended defaults:

- allow automatic personal tenant plus optional Clerk organization;
- use cached-live demo evidence with rate-limited refresh;
- expire demo sessions after 24 hours;
- disable real TriggerWare in demo mode and show a simulated workflow receipt;
- start with graph panels in Monitor and Evidence, then add a dedicated graph page later.
