"""
Gap 1: Named entity extraction — second LLM call after synthesis to pull real named entities
(companies, regulations, products, events) from the synthesis text into structured facts.

Without this, entity_name holds page titles or workspace categories, not real entities.
The knowledge graph cannot be meaningful until nodes represent real named subjects.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from packages.common.logging import get_logger

if TYPE_CHECKING:
    from packages.llm.client import LLMClient

logger = get_logger(__name__)

EXTRACTION_PROMPT = """You are an intelligence extraction engine. From the research synthesis below, extract all named entities and events that are specifically mentioned.

Return ONLY valid JSON in this exact format:
{
  "entities": [
    {
      "name": "Okta",
      "type": "company",
      "event": "security advisory issued",
      "event_type": "breach",
      "severity": "high",
      "source_hint": "optional url or domain if mentioned"
    }
  ]
}

Rules:
- "name" must be a specific proper noun (company name, regulation name, product name, person, event). NOT a generic category like "vendors" or "competitors".
- "type" must be one of: company | regulation | product | person | event | organization
- "event_type" must be one of: breach | acquisition | pricing | regulatory | competitor_move | funding | product_launch | personnel | legal | other
- "severity" must be one of: critical | high | medium | low
- Only include entities that are specifically named in the text — skip generic terms.
- If no specific named entities are found, return {"entities": []}.
- Do not include commentary or markdown — return raw JSON only."""


class EntityExtractor:
    def __init__(self, llm: "LLMClient | None" = None) -> None:
        self.llm = llm

    async def extract(self, synthesis_text: str, max_entities: int = 15) -> list[dict]:
        """Extract named entities from the synthesis text. Returns list of entity dicts."""
        if not self.llm or not self.llm.available:
            return []
        if not synthesis_text or len(synthesis_text.strip()) < 40:
            return []
        try:
            result = await self.llm.chat_json(
                system=EXTRACTION_PROMPT,
                user=f"SYNTHESIS TEXT:\n{synthesis_text[:4000]}",
                temperature=0.1,
            )
            entities = result.get("entities") or []
            if not isinstance(entities, list):
                return []
            cleaned = []
            for ent in entities[:max_entities]:
                if not isinstance(ent, dict):
                    continue
                name = (ent.get("name") or "").strip()
                if not name or len(name) < 2:
                    continue
                cleaned.append({
                    "name": name,
                    "type": ent.get("type") or "company",
                    "event": ent.get("event") or "",
                    "event_type": ent.get("event_type") or "other",
                    "severity": ent.get("severity") or "medium",
                    "source_hint": ent.get("source_hint") or "",
                })
            return cleaned
        except Exception as exc:
            logger.warning("entity_extraction_failed", error=str(exc)[:200])
            return []

    def merge_into_facts(self, facts: dict, entities: list[dict]) -> dict:
        """Merge extracted entities into the existing facts dict (JSONB column)."""
        if not entities:
            return facts
        updated = dict(facts) if facts else {}
        updated["extracted_entities"] = entities
        return updated
