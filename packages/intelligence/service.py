import asyncio
import re
import uuid
from datetime import timedelta
from typing import Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from apps.api.db.models import ChangeEvent, IntelligenceRecord, RefreshRun, Source, Topic
from packages.brightdata.client import BrightDataClient
from packages.common.config import get_settings
from packages.common.logging import get_logger
from packages.gateway.service import GatewayService
from packages.graph.neo4j_client import Neo4jGraphClient
from packages.common.time import utc_now
from packages.intelligence.utils import infer_authority, infer_source_type, stable_id, freshness_status
from packages.observability.metrics import RECORDS_REFRESHED
from packages.schemas.common import ToolName
from packages.schemas.gateway import GatewayFetchRequest
from packages.schemas.intelligence import (
    IntelligenceRecordRead,
    RetrievalRequest,
    RetrievalResult,
    SourceRecord,
    TopicCreate,
    TopicRead,
)

logger = get_logger(__name__)

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
    "how", "in", "into", "is", "it", "its", "me", "of", "on", "or", "our", "show",
    "that", "the", "their", "this", "to", "us", "what", "when", "where", "which",
    "who", "why", "with", "without", "about", "against", "latest", "current",
    "tell", "find", "give", "can", "could", "should", "would",
}


class IntelligenceService:
    def __init__(self, gateway: GatewayService | None = None) -> None:
        self.gateway = gateway or GatewayService()
        self.brightdata = BrightDataClient()
        self.graph = Neo4jGraphClient()
        self.settings = get_settings()

    async def create_topic(self, db: AsyncSession, topic: TopicCreate) -> TopicRead:
        existing = await db.get(Topic, topic.id)
        if existing:
            existing.name = topic.name
            existing.description = topic.description
            existing.entities = topic.entities
            existing.watch_types = topic.watch_types
            existing.refresh_frequency_minutes = topic.refresh_frequency_minutes
            await db.commit()
            return self._topic_read(existing)
        model = Topic(**topic.model_dump())
        db.add(model)
        await db.commit()
        return self._topic_read(model)

    async def list_topics(self, db: AsyncSession) -> list[TopicRead]:
        result = await db.execute(select(Topic).order_by(Topic.created_at.desc()))
        return [self._topic_read(t) for t in result.scalars().all()]

    async def discover_sources(
        self,
        db: AsyncSession,
        topic_id: str,
        limit: int = 8,
        query: str | None = None,
    ) -> list[SourceRecord]:
        topic = await db.get(Topic, topic_id)
        if not topic:
            topic = Topic(id=topic_id, name=topic_id.replace("_", " ").title(), entities=[], watch_types=[])
            db.add(topic)
            await db.commit()
        entities = [x for x in (topic.entities or []) if x]
        signals = [x for x in (topic.watch_types or []) if x]
        queries = []
        if query:
            queries.append(query.strip())
            for entity in entities[:3]:
                if entity and entity.lower() not in query.lower():
                    queries.append(f"{entity} {query}".strip())
        queries.extend(f"{entity} {' '.join(signals[:4])}".strip() for entity in entities[: max(limit, 1)])
        if not queries:
            queries = [" ".join([x for x in [topic.name, *signals] if x]) or topic_id]
        per_query_limit = max(1, (limit + len(queries) - 1) // len(queries))
        results = []
        seen_urls: set[str] = set()
        for query in queries:
            added_for_query = 0
            for item in await self.brightdata.serp_search(query):
                if item.url and item.url not in seen_urls:
                    results.append(item)
                    seen_urls.add(item.url)
                    added_for_query += 1
                if added_for_query >= per_query_limit:
                    break
            if len(results) >= limit:
                break
        results = results[:limit]
        records: list[SourceRecord] = []
        for r in results[:limit]:
            source_id = stable_id(topic_id, r.url)
            source = await db.get(Source, source_id)
            if not source:
                source = Source(
                    id=source_id,
                    topic_id=topic_id,
                    url=r.url,
                    title=r.title,
                    snippet=r.snippet,
                    source_type=infer_source_type(r.url),
                    authority=infer_authority(r.url),
                )
                db.add(source)
            records.append(
                SourceRecord(
                    url=r.url,
                    title=r.title,
                    snippet=r.snippet,
                    source_type=infer_source_type(r.url),
                    authority=infer_authority(r.url),
                )
            )
        await db.commit()
        return records

    async def refresh_topic(
        self,
        db: AsyncSession,
        topic_id: str,
        max_sources: int = 8,
        query: str | None = None,
    ) -> dict[str, Any]:
        run_id = str(uuid.uuid4())
        run = RefreshRun(id=run_id, topic_id=topic_id, status="running")
        db.add(run)
        await db.commit()
        discovered = await self.discover_sources(db, topic_id, limit=max_sources, query=query)
        discovered_urls = [source.url for source in discovered]
        if discovered_urls:
            result = await db.execute(
                select(Source)
                .where(Source.topic_id == topic_id, Source.url.in_(discovered_urls))
                .limit(max_sources)
            )
        else:
            result = await db.execute(select(Source).where(Source.topic_id == topic_id).limit(max_sources))
        sources = result.scalars().all()
        created = 0
        checked = 0
        try:
            for source in sources:
                checked += 1
                try:
                    record = await asyncio.wait_for(
                        self.extract_and_store(db, topic_id, source),
                        timeout=min(12, self.settings.request_timeout_seconds),
                    )
                except TimeoutError:
                    continue
                if record:
                    created += 1
                    RECORDS_REFRESHED.labels(topic_id=topic_id).inc()
            run.status = "success"
            run.sources_checked = checked
            run.records_created = created
            run.completed_at = utc_now()
            await db.commit()
        except Exception as exc:
            run.status = "failed"
            run.error = str(exc)
            run.completed_at = utc_now()
            await db.commit()
        return {
            "run_id": run_id,
            "topic_id": topic_id,
            "sources_checked": checked,
            "records_created": created,
            "status": run.status,
            "error": run.error,
        }

    async def extract_and_store(self, db: AsyncSession, topic_id: str, source: Source) -> IntelligenceRecordRead | None:
        topic = await db.get(Topic, topic_id)
        schema = {
            "company": "string",
            "pricing_model": "string",
            "starting_price": "string",
            "features": "list",
            "target_customers": "list",
            "positioning": "string",
        }
        response = await self.gateway.fetch(
            GatewayFetchRequest(
                url=source.url,
                task_type="competitive_intelligence_extraction",
                preferred_tool=ToolName.web_unlocker,
                output_schema=schema,
                max_attempts=1,
            )
        )
        if response.status != "success":
            return await self._store_source_metadata_record(db, topic, topic_id, source)
        facts = response.data
        entity_name = facts.get("company") or self._infer_entity_name(topic, source) or source.title or "Unknown"
        summary = self._summarize_record(entity_name, facts, source.url)
        record_id = stable_id(topic_id, source.url, entity_name)
        existing = await db.get(IntelligenceRecord, record_id)
        now = utc_now()
        if existing:
            await self._detect_changes(db, existing, facts, topic_id)
            existing.facts_json = facts
            existing.summary = summary
            existing.confidence = response.confidence
            existing.freshness_status = "fresh"
            existing.last_checked = now
            existing.extracted_at = now
            model = existing
        else:
            model = IntelligenceRecord(
                id=record_id,
                topic_id=topic_id,
                source_id=source.id,
                entity_name=entity_name,
                entity_type="company",
                source_url=source.url,
                source_type=source.source_type,
                facts_json=facts,
                summary=summary,
                confidence=response.confidence,
                freshness_status="fresh",
                embedding_text=self._embedding_text(entity_name, facts, summary),
                last_checked=now,
                extracted_at=now,
            )
            db.add(model)
        source.last_checked = now
        source.next_refresh_due = now + timedelta(minutes=1440)
        await db.commit()
        payload = self._record_read(model)
        self._mirror_graph(payload)
        return payload

    async def _store_source_metadata_record(
        self,
        db: AsyncSession,
        topic: Topic | None,
        topic_id: str,
        source: Source,
    ) -> IntelligenceRecordRead:
        entity_name = self._infer_entity_name(topic, source) or source.title or "Unknown"
        facts = {
            "company": entity_name,
            "evidence_title": source.title,
            "snippet": source.snippet,
            "source_url": source.url,
            "extraction_status": "source_metadata_fallback",
        }
        summary = self._summarize_record(entity_name, facts, source.url)
        record_id = stable_id(topic_id, source.url, entity_name)
        now = utc_now()
        existing = await db.get(IntelligenceRecord, record_id)
        if existing:
            existing.facts_json = facts
            existing.summary = summary
            existing.confidence = 0.55
            existing.freshness_status = "fresh"
            existing.last_checked = now
            existing.extracted_at = now
            model = existing
        else:
            model = IntelligenceRecord(
                id=record_id,
                topic_id=topic_id,
                source_id=source.id,
                entity_name=entity_name,
                entity_type="company",
                source_url=source.url,
                source_type=source.source_type,
                facts_json=facts,
                summary=summary,
                confidence=0.55,
                freshness_status="fresh",
                embedding_text=self._embedding_text(entity_name, facts, summary),
                last_checked=now,
                extracted_at=now,
            )
            db.add(model)
        source.last_checked = now
        source.next_refresh_due = now + timedelta(minutes=1440)
        await db.commit()
        payload = self._record_read(model)
        self._mirror_graph(payload)
        return payload

    def _mirror_graph(self, payload: IntelligenceRecordRead) -> bool:
        try:
            self.graph.upsert_intelligence_record({
                "id": payload.id,
                "topic_id": payload.topic_id,
                "entity_name": payload.entity_name,
                "entity_type": payload.entity_type,
                "source_url": payload.source_url,
                "source_type": payload.source_type,
                "facts": payload.facts,
                "summary": payload.summary,
                "confidence": payload.confidence,
                "freshness_status": payload.freshness_status,
                "last_checked": payload.last_checked,
            })
            return True
        except Exception as exc:
            logger.warning("neo4j_mirror_failed", error=str(exc)[:300], topic_id=payload.topic_id, source_url=payload.source_url)
            return False

    async def backfill_graph(
        self,
        db: AsyncSession,
        topic_id: str,
        include_stale: bool = False,
        freshness_required_days: int = 7,
        limit: int = 500,
    ) -> dict[str, Any]:
        graph_status = self.graph.health()
        if graph_status != "ok":
            return {
                "status": graph_status,
                "topic_id": topic_id,
                "records_seen": 0,
                "records_mirrored": 0,
                "records_skipped_stale": 0,
                "records_failed": 0,
                "message": self.graph.message,
            }

        result = await db.execute(
            select(IntelligenceRecord)
            .where(IntelligenceRecord.topic_id == topic_id)
            .order_by(IntelligenceRecord.extracted_at.desc())
            .limit(limit)
        )
        records = result.scalars().all()
        mirrored = 0
        skipped_stale = 0
        failed = 0
        for record in records:
            if not include_stale and not self._record_is_current(record, freshness_required_days):
                skipped_stale += 1
                continue
            if self._mirror_graph(self._record_read(record)):
                mirrored += 1
            else:
                failed += 1

        return {
            "status": "ok",
            "topic_id": topic_id,
            "records_seen": len(records),
            "records_mirrored": mirrored,
            "records_skipped_stale": skipped_stale,
            "records_failed": failed,
            "message": None,
        }

    def _infer_entity_name(self, topic: Topic | None, source: Source) -> str | None:
        haystack = " ".join([source.title or "", source.snippet or "", source.url or ""]).lower()
        entities = topic.entities if topic and topic.entities else []
        for entity in entities:
            if entity and entity.lower() in haystack:
                return entity
        return None

    async def retrieve_context(self, db: AsyncSession, req: RetrievalRequest) -> list[RetrievalResult]:
        stmt = select(IntelligenceRecord)
        if req.topic_id:
            stmt = stmt.where(IntelligenceRecord.topic_id == req.topic_id)
        result = await db.execute(stmt)
        records = result.scalars().all()
        scored: list[RetrievalResult] = []
        query_terms = self._query_terms(req.query)
        for rec in records:
            if req.freshness_required_days and not self._record_is_current(rec, req.freshness_required_days):
                continue
            score, reasons = self._score_record(rec, query_terms, req)
            scored.append(RetrievalResult(record=self._record_read(rec), score=score, reasons=reasons))
        scored.sort(key=lambda x: x.score, reverse=True)
        return scored[: req.top_k]

    async def list_records(
        self,
        db: AsyncSession,
        topic_id: str | None = None,
        include_stale: bool = False,
        freshness_required_days: int = 7,
    ) -> list[IntelligenceRecordRead]:
        stmt = select(IntelligenceRecord).order_by(IntelligenceRecord.extracted_at.desc())
        if topic_id:
            stmt = stmt.where(IntelligenceRecord.topic_id == topic_id)
        result = await db.execute(stmt)
        records = result.scalars().all()
        if not include_stale:
            records = [record for record in records if self._record_is_current(record, freshness_required_days)]
        return [self._record_read(r) for r in records]

    async def _detect_changes(self, db: AsyncSession, existing: IntelligenceRecord, new_facts: dict, topic_id: str) -> None:
        old = existing.facts_json or {}
        for key, new_value in new_facts.items():
            if old.get(key) != new_value:
                db.add(
                    ChangeEvent(
                        id=str(uuid.uuid4()),
                        topic_id=topic_id,
                        record_id=existing.id,
                        change_type="field_updated",
                        field=key,
                        old_value={"value": old.get(key)},
                        new_value={"value": new_value},
                    )
                )

    def _score_record(self, rec: IntelligenceRecord, query_terms: set[str], req: RetrievalRequest) -> tuple[float, list[str]]:
        text = " ".join([rec.entity_name or "", rec.summary or "", rec.source_url or "", str(rec.facts_json or {})]).lower()
        text_terms = self._query_terms(text)
        overlap_terms = query_terms.intersection(text_terms)
        overlap = len(overlap_terms) / max(len(query_terms), 1)
        phrase_match = any(term in text for term in query_terms if len(term) >= 5)
        semantic_score = min(1.0, overlap + (0.10 if phrase_match else 0))
        entity_match = 1.0 if any(e and e.lower() in text for e in req.entities) else 0.0
        fresh = 1.0 if freshness_status(rec.last_checked, req.freshness_required_days) == "fresh" else 0.2
        authority = 0.9 if rec.source_type in {"pricing_page", "docs_page", "company_page"} else 0.6
        confidence = rec.confidence or 0.0
        if query_terms and semantic_score < 0.12 and not entity_match:
            return 0.0, ["no_query_match"]
        score = 0.50 * semantic_score + 0.20 * entity_match + 0.10 * fresh + 0.05 * authority + 0.15 * confidence
        reasons = []
        if semantic_score >= 0.12:
            reasons.append("semantic_match")
        if overlap_terms:
            reasons.extend([f"term:{term}" for term in sorted(overlap_terms)[:5]])
        if entity_match:
            reasons.append("entity_match")
        if fresh >= 1.0:
            reasons.append("fresh")
        if confidence > 0.7:
            reasons.append("high_confidence")
        return round(score, 4), reasons

    def _query_terms(self, text: str | None) -> set[str]:
        raw_terms = re.findall(r"[a-z0-9][a-z0-9_-]{2,}", (text or "").lower())
        return {term.strip("_-") for term in raw_terms if term not in STOPWORDS and len(term.strip("_-")) >= 3}

    def _record_is_current(self, rec: IntelligenceRecord, freshness_required_days: int | None = 7) -> bool:
        if rec.freshness_status == "stale":
            return False
        status = freshness_status(rec.last_checked, freshness_required_days)
        return status in {"fresh", "unknown"}

    def _summarize_record(self, entity: str, facts: dict[str, Any], url: str) -> str:
        parts = [entity]
        if facts.get("positioning"):
            parts.append(f"positions as {facts['positioning']}")
        if facts.get("pricing_model"):
            parts.append(f"with {facts['pricing_model']} pricing")
        if facts.get("features"):
            parts.append(f"and features including {', '.join(map(str, facts['features'][:3]))}")
        return " ".join(parts) + f". Source: {url}"

    def _embedding_text(self, entity: str, facts: dict[str, Any], summary: str) -> str:
        return " ".join([entity, summary, str(facts)])

    def _topic_read(self, topic: Topic) -> TopicRead:
        return TopicRead(
            id=topic.id,
            name=topic.name,
            description=topic.description,
            entities=topic.entities or [],
            watch_types=topic.watch_types or [],
            refresh_frequency_minutes=topic.refresh_frequency_minutes,
            created_at=str(topic.created_at) if topic.created_at else None,
        )

    def _record_read(self, rec: IntelligenceRecord) -> IntelligenceRecordRead:
        return IntelligenceRecordRead(
            id=rec.id,
            topic_id=rec.topic_id,
            entity_name=rec.entity_name,
            entity_type=rec.entity_type,
            source_url=rec.source_url,
            source_type=rec.source_type,
            facts=rec.facts_json or {},
            summary=rec.summary,
            confidence=rec.confidence or 0.0,
            freshness_status=rec.freshness_status,
            last_checked=str(rec.last_checked) if rec.last_checked else None,
            extracted_at=str(rec.extracted_at) if rec.extracted_at else None,
        )
