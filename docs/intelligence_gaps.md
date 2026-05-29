# Intelligence Quality — Gap Analysis and Closure Plan

> **Purpose**: Document the transformation gaps between raw web data and actionable business intelligence, with concrete implementation steps to close each one.

---

## The Core Value Contract

Every monitor run and analyst session must deliver:

> *What changed in your environment since last time · Why it matters specifically to your business · What to do about it · Source evidence so you can verify*

Everything in the system should serve that contract. Any code that doesn't move toward it is overhead.

---

## Gap 1 — Entity names are page titles, not real entities

### Problem

`entity_name` on `IntelligenceRecord` today holds either a workspace category ("competitors") or the scraped page title ("8 Different Types of Vendor Risks to Monitor in 2025"). Neither is a real entity. A real entity is **Okta**, **EU AI Act 2024**, **Stripe**, **OpenAI GPT-5**. Without real entity extraction, the knowledge graph is a filing cabinet of scrape jobs, not an intelligence layer.

### What to build

**Named entity extraction step** — after the LLM synthesizes a report, run a second LLM call to extract structured facts from the synthesis:

```python
# packages/agents/entity_extractor.py  (new)
EXTRACTION_PROMPT = """
From the intelligence synthesis below, extract all named entities and events.
Return JSON: {"entities": [{"name": "...", "type": "company|regulation|person|product|event",
  "event": "...", "event_type": "breach|acquisition|pricing|regulatory|competitor_move|other",
  "severity": "critical|high|medium|low", "source_url": "..."}]}
Only include entities that are specific named subjects — not generic categories.
"""
```

Store extracted entities in `IntelligenceRecord.facts` (already a JSONB column). Write them to Neo4j as real typed nodes. Use them as the display name in the evidence panel and decision brief.

**Impact on graph**: Instead of `Workspace → [page title]`, the graph becomes `Workspace → Okta → Security Advisory CVE-2025-XXXX → affects: Authentication`.

**Where to wire it**: `ReportSynthesizer._synthesize_with_llm()` after the main synthesis call. Gate it behind `self.llm.available`. If no LLM, fall back to current behaviour — extracting the workspace entity list as entity names.

**Schema addition needed**:
```sql
-- Already exists on intelligence_records:
-- facts JSONB  →  add extracted_entities array inside facts
-- No migration needed, just populate the new key
```

---

## Gap 2 — No change detection surfaced to the user

### Problem

The `change_events` table captures field-level diffs but it is never surfaced in the decision brief. Every run delivers a full snapshot. Users cannot see what is new vs what was already known. The delta is the value — the snapshot is just storage.

### What to build

**ChangeDetectionService** — compare current run output against the previous successful run for the same workspace:

```python
# packages/intelligence/change_detection.py  (new)
@dataclass
class ChangeReport:
    new_signals: list[str]          # signals not in previous run
    resolved_signals: list[str]     # signals in previous run but not current
    risk_posture_change: str | None # e.g. "stable → elevated"
    new_entities: list[str]         # newly extracted named entities
    confidence_delta: float         # current - previous
    run_ids: tuple[str, str]        # (previous_run_id, current_run_id)
```

Wire into `ResearchAgentOrchestrator.run()` after reasoning, before writing the `agent_run` record. Attach as `report.change_report`. Display in `DecisionBrief` as the **first section** — not buried below the summary.

**Frontend** — the headline of every brief should be the delta:

```
+3 new signals  |  2 resolved  |  Risk: stable → elevated  |  vs run 2 days ago
```

This replaces the current generic "X evidence records analysed" header.

**Where to query**: `agent_runs` table, `WHERE topic_id = $topic_id AND status = 'success' ORDER BY created_at DESC LIMIT 2`. The second row is the baseline.

---

## Gap 3 — Evidence quality is flat (all sources treated equally)

### Problem

A CVE advisory from Okta's official security page and a blog post titled "Top 10 vendor risks" carry identical weight in the system. Primary sources are vastly more reliable and time-sensitive. Without source tiering, low-quality content can suppress or dilute high-signal primary evidence.

### What to build

**Source quality classifier** — in `IntelligenceService` at ingest time:

```python
# packages/intelligence/source_quality.py  (new)
TIER_1_PATTERNS = [
    r"sec\.gov", r"cve\.mitre\.org", r"nvd\.nist\.gov",
    r"eur-lex\.europa\.eu", r"federalregister\.gov",
    # vendor trust centres
    r"trust\.(okta|salesforce|aws|google)\.com",
    r"security\.microsoft\.com",
    # financial filings
    r"investor\.", r"/press-release/", r"/newsroom/",
]
TIER_2_PATTERNS = [r"reuters\.com", r"ft\.com", r"wsj\.com", r"techcrunch\.com"]
# Everything else = tier 3
```

Add `source_tier: int` (1/2/3) to `IntelligenceRecord`. Boost tier-1 sources in retrieval ranking. Show the tier as a badge in the evidence panel — users should immediately see when a signal comes from an official source vs a blog.

**Migration**:
```sql
ALTER TABLE intelligence_records ADD COLUMN source_tier INTEGER DEFAULT 3;
```

**Retrieval weighting**: In `IntelligenceService.rank_records()`, multiply relevance score by `{1: 1.4, 2: 1.15, 3: 1.0}[source_tier]`.

---

## Gap 4 — Signals are generic; impact is not linked to the user's context

### Problem

"Competitor move detected" means nothing. "OpenAI launched a feature that directly overlaps with your Q3 roadmap — 4 of your tracked accounts have OpenAI as an alternative" is actionable. The system has `OrgContext` (contracts, risk thresholds, entities) but the reasoning step doesn't yet use it to personalize impact statements.

### What to build

**Context-linked impact in ReasoningEngine** — when evaluating a materiality assessment, cross-reference the signal's extracted entities against the user's org context:

```python
# packages/reasoning/engine.py — extend evaluate()
def _link_to_org_context(
    self, signal_entities: list[str], org_context: OrgContextRead
) -> str | None:
    """Return a specific impact string if the signal touches a known contract or vendor."""
    for entity in signal_entities:
        for contract in (org_context.contracts or []):
            if entity.lower() in contract.lower():
                return f"{entity} is named in your org context — review exposure."
    return None
```

Store the result as `impact_context: str` on `MaterialityAssessment`. Surface it in the decision brief immediately below the finding — not in a separate panel.

**Longer term**: The `OrgContext` should include structured vendor tiers (critical/important/standard), product dependencies, and regulatory obligations. The more structured this is, the more specific the impact linking can be.

---

## Gap 5 — The knowledge graph shows structure, not meaning

### Problem

The graph currently stores: `Workspace → scraped page → source URL`. That's a filing index. The graph is worth integrating only when it answers questions that a flat list cannot:

- *Which of my vendors share this compliance risk?*
- *This competitor raised $50M — which of my accounts overlap with theirs?*
- *This regulation changed — which suppliers in my network are affected?*

To answer those, graph nodes must be real named entities and edges must be semantic relationships.

### What to build

**Relationship extraction** — after entity extraction (Gap 1), extract relationship triples:

```python
RELATIONSHIP_PROMPT = """
From these named entities and the synthesis, extract relationships.
Return JSON: {"relationships": [{"subject": "Okta", "predicate": "HAS_VULNERABILITY",
  "object": "CVE-2025-1234", "confidence": 0.9}]}
Predicates to use: COMPETES_WITH | REGULATED_BY | ACQUIRED | HAS_VULNERABILITY |
  AFFECTS_SECTOR | PARTNERS_WITH | RAISED_FUNDING | LAUNCHED_PRODUCT
"""
```

Write these as Neo4j edges between real entity nodes. The graph then supports:

```cypher
-- "Which vendors are affected by EU AI Act?"
MATCH (r:Regulation {name: "EU AI Act"})<-[:REGULATED_BY]-(v:Vendor)
WHERE v.tenant_id = $tenant_id
RETURN v.name, v.compliance_status

-- "Which competitors launched something in the last 30 days?"
MATCH (c:Competitor)-[:LAUNCHED_PRODUCT]->(p:Product)
WHERE c.tenant_id = $tenant_id AND p.detected_at > $cutoff
RETURN c.name, p.name, p.detected_at
```

**Graph display** — node labels in the canvas should be the real entity name, not a summary prefix. Relationship edges should show their predicate type. The graph becomes readable by a non-technical executive.

---

## The Full Intelligence Chain (Target State)

Every run should produce a traceable chain from web event to business action:

```
[Source]  SEC filing / CVE advisory / news article  (tier 1/2/3)
    ↓  entity extraction
[Named Entity]  "Okta" — type: vendor, event: security advisory
    ↓  change detection
[Signal]  NEW this run — was not in previous run 3 days ago
    ↓  context linking
[Your Exposure]  Okta is your Tier-1 SSO vendor (matched from OrgContext)
    ↓  materiality assessment
[Business Impact]  Auth bypass risk — SLA clause 8.2 may be triggered
    ↓  recommendation
[Action]  Update Okta SDK to v3.4.1 within 72 hours — assign to security team
    ↓  confidence
[Evidence]  okta.com/security/advisories (tier 1), confidence 0.94
```

This is the chain users should see. Every gap above breaks one link in it.

---

## Build Priority

| Priority | Gap | User impact | Effort |
|---|---|---|---|
| 1 | Change detection (Gap 2) | Highest — makes every run a diff, not a snapshot | Medium |
| 2 | Named entity extraction (Gap 1) | Makes graph and evidence meaningful | Medium |
| 3 | Source quality tiering (Gap 3) | Increases trust in evidence | Low |
| 4 | Context-linked impact (Gap 4) | Personalises output to user's business | Medium |
| 5 | Semantic graph relationships (Gap 5) | Unlocks cross-entity queries | High |

Gaps 1–3 can be shipped independently. Gap 4 depends on Gap 1. Gap 5 depends on Gap 1 and benefits from Gap 4.

---

## What does NOT need building

- More graph modes or visualisation styles (the graph works; the data it shows needs to improve first)
- More intelligence packs (four is enough; deepen the existing ones)
- More LLM calls per run (one synthesis + one extraction is enough; avoid latency creep)
- Anything that makes the UI more complex without making the output clearer

The system needs deeper intelligence on fewer things, not wider coverage of more things.
