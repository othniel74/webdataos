# WebDataOS Business Requirements Document (BRD)

## 1. Executive Summary

WebDataOS is an enterprise live-web intelligence runtime for AI agents. It turns public web signals into fresh, structured, evidence-backed intelligence that enterprise teams can use across Security & Compliance, GTM Intelligence, and Finance & Market Intelligence workflows.

The product is designed to move beyond a hackathon demo into an adoptable enterprise product. Users sign up, create a workspace, choose one or more intelligence packages, add monitored entities, define signals, select refresh cadence, and run AI-assisted intelligence tasks. The system checks existing intelligence records first, retrieves live public web evidence when records are stale or missing, routes through Bright Data tools, normalizes outputs into clean JSON, and stores reusable evidence records.

## 2. Product Vision

To become the live-web intelligence layer enterprise agents rely on before they make decisions from external web data.

WebDataOS is not positioned as another chatbot or one-off scraper. It is a reusable runtime layer that provides:

- Freshness-aware intelligence retrieval
- Bright Data-powered recovery routes
- Structured evidence records
- Agent-ready JSON output
- Package-specific enterprise workflows
- Developer APIs and SDKs for integration

## 3. Problem Statement

Enterprise AI agents often fail when asked to reason over the live web because public web data is fragmented, blocked, dynamic, unstructured, geo-dependent, and frequently stale. Teams still rely on manual research, fragile scraping scripts, periodic vendor reviews, stale spreadsheets, and disconnected intelligence tools.

This creates practical business problems:

- Security teams miss public third-party risk signals.
- Compliance teams react late to regulatory and policy changes.
- GTM teams rely on manual competitor and market research.
- Finance and procurement teams struggle to monitor supplier and market signals in real time.
- AI agents lack a trusted, structured, evidence-backed external context layer.

## 4. Target Users

### Primary Users

- Security and compliance teams
- Vendor risk managers
- GRC analysts
- Revenue operations teams
- Market intelligence analysts
- Procurement risk teams
- Product marketing and strategy teams

### Technical Users

- AI engineers
- Data engineers
- Platform engineers
- Developer teams integrating live-web intelligence into internal tools

## 5. Intelligence Packages

### 5.1 Security & Compliance Pack

Purpose: Monitor vendor risk, regulatory updates, breach exposure, policy changes, and public risk signals.

Typical entities:

- Vendors
- Regulators
- Domains
- Security policy pages

Signals:

- Breach exposure
- Regulatory updates
- Compliance changes
- Security posture changes
- Public incident mentions

### 5.2 GTM Intelligence Pack

Purpose: Track competitors, pricing, messaging, hiring signals, account enrichment, and buying intent.

Typical entities:

- Competitors
- Target accounts
- Products
- Markets

Signals:

- Competitor moves
- Pricing changes
- Messaging shifts
- Hiring trends
- Buying intent signals

### 5.3 Finance & Market Pack

Purpose: Monitor filings, supplier signals, pricing movement, sector changes, and alternative market data.

Typical entities:

- Companies
- Suppliers
- Sectors
- Market pages

Signals:

- Filings
- Supplier movement
- Pricing changes
- Market movement
- Alternative data signals

### 5.4 Enterprise Intelligence OS Pack

Purpose: Combine Security, GTM, and Finance intelligence in one workspace with shared evidence, cross-track alerts, and executive briefs.

This is the highest-tier package and the strongest enterprise adoption path.

## 6. Core User Journey

1. User signs up.
2. User creates an intelligence workspace.
3. User selects an intelligence package.
4. User enters monitored entities.
5. User defines signals to watch.
6. User sets refresh cadence.
7. Agent receives a research task.
8. Intelligence Engine checks existing records.
9. If context is fresh, the system returns stored context.
10. If context is stale or missing, Gateway calls Bright Data routes.
11. Bright Data tools retrieve, unlock, render, scrape, and normalize public web data.
12. System returns clean JSON and a sourced intelligence brief.
13. Evidence record is stored for reuse.

## 7. Functional Requirements

### Workspace Management

- Create workspace
- List workspaces
- Retrieve workspace details
- Store package selection
- Store monitored entities
- Store signals to watch
- Store refresh cadence

### Package Management

- List available packages
- Allow package selection
- Support focused packages and combo package
- Attach default entities, signals, and Bright Data routes to each package

### Agent Workspace

- Accept research prompt
- Use workspace and package context
- Check intelligence records before retrieval
- Return sourced intelligence brief
- Display run history
- Display trace events
- Display evidence sources

### Intelligence Engine

- Store intelligence records
- Evaluate freshness
- Rank records by relevance and freshness
- Mark records as used, refreshed, skipped, or stale
- Return agent-ready context package

### Bright Data Gateway

- Route retrieval tasks to Bright Data products
- Support SERP API, Web Unlocker, Scraping Browser, Web Scraper API, MCP Server, and proxies where relevant
- Detect failure modes
- Retry and recover using alternative routes
- Normalize outputs into clean JSON
- Generate recovery receipts

### Developer Layer

- Provide REST APIs
- Provide SDK direction for Python and TypeScript
- Support local mock mode
- Support production mode when Bright Data credentials are configured

## 8. Non-Functional Requirements

- Production-grade modular architecture
- Clear separation between UI, API, gateway, intelligence, and agent orchestration
- Secure API key handling
- Audit-ready recovery receipts
- Traceable intelligence records
- Scalable workspace model
- Extensible package configuration
- Observable backend services
- Deployable through Docker-based infrastructure

## 9. Business Value

WebDataOS reduces manual external research and improves the reliability of enterprise AI agents by giving them fresh, structured, recoverable web intelligence.

Primary business benefits:

- Faster third-party risk monitoring
- Faster competitor and market intelligence
- Better evidence-backed decision-making
- Reduced scraping maintenance
- Reusable intelligence records
- Developer-ready live-web intelligence APIs
- Clear path from hackathon project to enterprise SaaS product

## 10. Success Metrics

### Product Metrics

- Workspaces created
- Entities monitored
- Research runs completed
- Records reused versus refreshed
- Gateway recovery success rate
- Time saved per research workflow

### Technical Metrics

- API response time
- Gateway success rate
- Bright Data route success rate
- Recovery path completion rate
- JSON normalization success rate
- Error rate per package

### Business Metrics

- Trial-to-paid conversion
- Average monitored entities per account
- Retention by package
- Upgrade rate from focused pack to Enterprise Intelligence OS
- Enterprise integration requests

## 11. MVP Scope

The MVP should include:

- Workspace creation
- Package selection
- Mock-live Agent page
- Intelligence records page
- Gateway recovery page
- Bright Data route configuration
- REST API support for workspaces, agent runs, gateway jobs, and intelligence records
- Documentation for enterprise implementation

## 12. Post-MVP Roadmap

- Real Bright Data API integration
- Persistent database-backed workspace records
- Authentication and tenant isolation
- Scheduled monitoring jobs
- Alerts and notifications
- Evidence export
- Slack, email, CRM, GRC, and workflow integrations
- Billing by package, monitored entities, and retrieval volume
- SDK hardening for Python and TypeScript

## Partner Runtime Update: Speechmatics + Cognee + TriggerWare

WebDataOS now treats partner technologies as runtime layers rather than optional side demos.

### Partner Responsibilities

| Partner | Product role | Business value |
|---|---|---|
| Speechmatics | Converts spoken requests and uploaded audio into structured transcript records | Enables voice interaction and ingestion of calls, webinars, earnings calls, vendor meetings, podcasts, and interviews |
| Cognee | Stores and retrieves reusable evidence memory, entity history, and prior intelligence context | Reduces repeated research, improves continuity across monitoring cycles, and gives the agent memory beyond a single run |
| Bright Data | Retrieves, unlocks, renders, scrapes, and normalizes live public web evidence | Keeps enterprise intelligence current and resilient against stale data, blocking, JavaScript pages, and source changes |
| TriggerWare | Turns material signals into workflow actions, alerts, review tasks, and downstream events | Moves the product from passive intelligence to operational response |

### Updated User Workflow

1. User creates a workspace and chooses Security, GTM, Finance, or Enterprise Intelligence OS.
2. User interacts through text, voice, or audio upload.
3. Speechmatics transcribes voice/audio into structured text.
4. Cognee checks prior evidence memory for reusable context.
5. Bright Data retrieves fresh public web evidence when memory is stale or incomplete.
6. WebDataOS synthesizes a sourced brief and stores reusable intelligence memory back into Cognee.
7. TriggerWare fires alerts, tasks, or review workflows when important thresholds are met.
8. The user receives a sourced intelligence brief, clean JSON, and receipts for memory/retrieval/workflow actions.

### Updated MVP Scope

The MVP must include mock-safe integration contracts for all partner layers, with real provider keys replaceable through environment variables. The first production-ready implementation should support:

- Text and voice request mode.
- Audio/transcript ingestion endpoint.
- Cognee memory search and memory upsert endpoints.
- Bright Data retrieval and recovery path.
- TriggerWare workflow trigger endpoint.
- Partner trace in every agent run response.
- Enterprise UI pages showing transcription, memory, retrieval, workflow action, and evidence JSON.

### Commercial Positioning

The product is no longer only a live-web data system. It is an enterprise intelligence runtime that can listen, remember, retrieve, and act. This strengthens adoption potential because enterprise teams do not only need research; they need repeatable intelligence workflows tied to alerts, reviews, and operational actions.
