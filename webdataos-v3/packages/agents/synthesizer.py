"""Report synthesizer — produces intelligence briefs from evidence records.

When an LLM client is available (OPENAI_API_KEY set), the synthesizer sends
the research task, extracted evidence, and prior memory context to the LLM
and receives a structured intelligence brief with contextual analysis.

When no LLM is configured, falls back to deterministic rule-based synthesis.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from packages.llm.client import LLMClient
from packages.schemas.intelligence import IntelligenceRecordRead
from packages.schemas.partners import MemoryRecord

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an enterprise intelligence analyst. You receive:
1. A research task describing what the user wants to know.
2. Structured evidence records extracted from live public web sources via Bright Data.
3. Prior memory context from previous research runs (via Cognee).

Your job is to synthesize a concise, actionable intelligence brief.

IMPORTANT RULES:
- Every claim must be backed by a specific evidence record. Cite source URLs.
- Distinguish between facts (extracted from sources) and analysis (your reasoning).
- Flag stale records — if freshness_status is "stale", note the data may not be current.
- Identify changes — if memory shows a previous value and the current evidence shows a different value, highlight the change.
- Be specific about numbers, dates, pricing, and features. Do not generalize.
- Assess overall confidence based on evidence quality, freshness, and coverage.

Respond ONLY with a JSON object (no markdown, no explanation) with this exact structure:
{
  "summary": "2-4 sentence executive summary of the intelligence brief",
  "key_findings": ["finding 1 with source citation", "finding 2", ...],
  "companies": [
    {
      "name": "company name",
      "positioning": "how they position themselves",
      "pricing_model": "their pricing model if detected",
      "starting_price": "starting price if detected",
      "features": ["feature1", "feature2"],
      "target_customers": ["segment1", "segment2"],
      "source_url": "the URL this was extracted from",
      "freshness": "fresh or stale",
      "confidence": 0.0 to 1.0
    }
  ],
  "recent_changes": [
    {
      "entity": "entity name",
      "field": "what changed",
      "old_value": "previous value from memory",
      "new_value": "current value from evidence",
      "significance": "why this matters"
    }
  ],
  "confidence": 0.0 to 1.0,
  "gaps": ["what information is missing or stale"]
}"""


class ReportSynthesizer:
    def __init__(self, llm: LLMClient | None = None) -> None:
        self.llm = llm

    async def synthesize_async(
        self,
        task: str,
        records: list[IntelligenceRecordRead],
        memories: list[MemoryRecord] | None = None,
    ) -> tuple[str, list[str], list[dict], list[dict], float]:
        """Async synthesis — uses LLM when available, otherwise falls back to rules."""
        if self.llm and self.llm.available and records:
            try:
                return await self._llm_synthesize(task, records, memories)
            except Exception as exc:
                logger.warning("llm_synthesis_failed, falling back to rule-based", error=str(exc))
                return self.synthesize(task, records)
        return self.synthesize(task, records)

    async def _llm_synthesize(
        self,
        task: str,
        records: list[IntelligenceRecordRead],
        memories: list[MemoryRecord] | None = None,
    ) -> tuple[str, list[str], list[dict], list[dict], float]:
        """Send evidence to the LLM and parse the structured response."""

        # Format evidence records for the prompt
        evidence_lines = []
        for i, rec in enumerate(records, 1):
            facts_str = json.dumps(rec.facts, indent=2) if rec.facts else "{}"
            evidence_lines.append(
                f"Record {i}:\n"
                f"  Entity: {rec.entity_name}\n"
                f"  Type: {rec.entity_type}\n"
                f"  Source: {rec.source_url}\n"
                f"  Source type: {rec.source_type}\n"
                f"  Freshness: {rec.freshness_status}\n"
                f"  Confidence: {rec.confidence}\n"
                f"  Last checked: {rec.last_checked}\n"
                f"  Summary: {rec.summary}\n"
                f"  Extracted facts:\n{facts_str}"
            )

        # Format memory context
        memory_lines = []
        if memories:
            for mem in memories:
                memory_lines.append(
                    f"Memory [{mem.entity}]: {mem.content} "
                    f"(score: {mem.score}, sources: {', '.join(mem.evidence_urls[:3])})"
                )

        user_prompt = (
            f"RESEARCH TASK:\n{task}\n\n"
            f"EVIDENCE RECORDS ({len(records)} records from Bright Data):\n"
            + "\n\n".join(evidence_lines)
            + ("\n\nPRIOR MEMORY CONTEXT (from Cognee):\n" + "\n".join(memory_lines) if memory_lines else "")
            + "\n\nProduce your intelligence brief as JSON."
        )

        result = await self.llm.chat_json(
            system=SYSTEM_PROMPT,
            user=user_prompt,
            temperature=0.3,
        )

        summary = result.get("summary", "Intelligence brief generated from live web evidence.")
        findings = result.get("key_findings", [])
        companies = result.get("companies", [])
        changes = result.get("recent_changes", [])
        confidence = result.get("confidence", 0.75)

        # Ensure findings is a list of strings
        if not isinstance(findings, list):
            findings = [str(findings)]

        logger.info("llm_synthesis_complete", findings=len(findings), companies=len(companies), confidence=confidence)

        return summary, findings, companies, changes, confidence

    def synthesize(
        self, task: str, records: list[IntelligenceRecordRead]
    ) -> tuple[str, list[str], list[dict], list[dict], float]:
        """Synchronous rule-based fallback — no LLM required."""
        if not records:
            return (
                "No fresh intelligence records were available after refresh.",
                ["The system could not gather enough data for a confident report."],
                [],
                [],
                0.2,
            )
        companies: list[dict[str, Any]] = []
        findings: list[str] = []
        changes: list[dict] = []
        for rec in records:
            facts = rec.facts or {}
            company = {
                "name": rec.entity_name or facts.get("company") or "Unknown",
                "positioning": facts.get("positioning"),
                "pricing_model": facts.get("pricing_model"),
                "starting_price": facts.get("starting_price"),
                "features": facts.get("features", []),
                "target_customers": facts.get("target_customers", []),
                "source_url": rec.source_url,
                "freshness": rec.freshness_status,
                "confidence": rec.confidence,
            }
            companies.append(company)
            if company["pricing_model"]:
                findings.append(f"{company['name']} shows a {company['pricing_model']} pricing signal.")
            if company["positioning"]:
                findings.append(f"{company['name']} positions around {company['positioning']}.")
        unique_findings = list(dict.fromkeys(findings))[:8]
        avg_conf = round(sum(r.confidence for r in records) / len(records), 3)
        summary = (
            f"The research task found {len(records)} fresh intelligence records across live web sources. "
            "The strongest signals are pricing model, positioning, target customer, and feature evidence."
        )
        return summary, unique_findings or ["Fresh source-backed records were collected."], companies, changes, avg_conf
