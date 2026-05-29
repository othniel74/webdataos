# WebDataOS Enterprise Product Implementation

## Product direction

WebDataOS should be implemented as a real enterprise product, not a static hackathon demo. The core product abstraction is a workspace that activates one or more intelligence packages.

## Implementation layers

### 1. Workspace and package layer

A workspace stores:

- workspace id
- workspace name
- selected package id
- monitored entities
- signals to watch
- refresh cadence
- Bright Data route preferences

Focused packages:

- Security & Compliance
- GTM Intelligence
- Finance & Market

Highest package:

- Enterprise Intelligence OS, combining all three.

Current implementation uses the existing `Topic` database model as the persistence layer for workspaces to avoid an immediate destructive migration. The `workspaces` API maps package settings into `Topic.entities`, `Topic.watch_types`, and `Topic.refresh_frequency_minutes`.

### 2. Agent Workspace

The Agent Workspace should call:

```text
POST /agent/research
```

with:

```json
{
  "task": "...",
  "workspace_id": "workspace_enterprise",
  "topic_id": "workspace_enterprise",
  "package_id": "enterprise",
  "freshness_required_days": 7,
  "max_sources": 8
}
```

The agent should always check existing intelligence records first before calling the gateway.

### 3. Intelligence Engine

The Intelligence Engine should handle:

- record retrieval
- freshness scoring
- source authority scoring
- change detection
- context packaging
- evidence storage

Relevant APIs:

```text
GET  /intelligence/records
POST /intelligence/retrieval/context
POST /intelligence/topics/{topic_id}/refresh
```

### 4. Bright Data Gateway

The Gateway should handle:

- source discovery through SERP API
- structured extraction through Web Scraper API
- blocked page recovery through Web Unlocker
- JavaScript-heavy pages through Scraping Browser
- fallback routing and clean JSON normalization

Relevant API:

```text
POST /gateway/fetch
```

### 5. Frontend mapping

The frontend has these pages:

- Landing: product positioning and package selection
- Setup: workspace creation and package configuration
- Agent: chat-like research workspace
- Intelligence: context records, freshness, and JSON package view
- Gateway: Bright Data recovery console and receipts
- Developer: API and SDK adoption surface

### 6. Production roadmap

Next implementation steps:

1. Add dedicated `workspaces` and `workspace_packages` database tables.
2. Add account, user, and organization tenancy.
3. Add real persistence for package config instead of encoding package id in topic description.
4. Add streaming run events for the Agent page.
5. Add gateway receipt storage and retrieval endpoint.
6. Add scheduled refresh workers per workspace cadence.
7. Add billing by workspace, package, and retrieval usage.
8. Add integration exports for Slack, email, Jira, ServiceNow, CRM, and GRC systems.

## Updated Enterprise Runtime: Listen, Remember, Retrieve, Act

The enterprise version now uses four runtime layers:

1. **Speechmatics** for speech-to-text and audio intelligence ingestion.
2. **Cognee** for durable agent memory and reusable evidence context.
3. **Bright Data** for resilient live public web retrieval and recovery.
4. **TriggerWare** for event-driven workflow automation.

This gives WebDataOS a clearer enterprise adoption story: users can ask naturally, the system remembers prior work, retrieves fresh public evidence when needed, and turns important findings into operational actions.

### Package Impact

- Security & Compliance: vendor risk calls, regulator updates, breach exposure, review tasks.
- GTM Intelligence: competitor webinars, sales calls, pricing movement, CRM/revops alerts.
- Finance & Market: earnings calls, supplier risk, filings, procurement review workflows.
- Enterprise Intelligence OS: all tracks combined with shared Cognee memory and TriggerWare workflows.

### Implementation Priority

1. Keep Bright Data as the required core retrieval provider.
2. Add Speechmatics as the voice/audio ingestion layer.
3. Add Cognee as the evidence memory layer.
4. Add TriggerWare as the automation layer.
5. Surface partner traces and receipts in the UI and API response.
