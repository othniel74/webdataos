import asyncio
import uuid
from datetime import timedelta
from typing import Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from apps.api.db.models import ChangeEvent, IntelligenceRecord, RefreshRun, Source, Topic
from packages.brightdata.client import BrightDataClient
from packages.common.config import get_settings
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


class IntelligenceService:
    def __init__(self, gateway: GatewayService | None = None) -> None:
        self.gateway = gateway or GatewayService()
        self.brightdata = BrightDataClient()
        self.graph = Neo4jGraphClient()
        self.settings = get_settings()

    async def create_topic(self, db: AsyncSession, topic: TopicCreate) -> TopicRead:
        existing = await db.get(Topic, topic.id)
        if existing:
            return self._topic_read(existing)
        model = Topic(**topic.model_dump())
        db.add(model)
        await db.commit()
        return self._topic_read(model)

    async def list_topics(self, db: AsyncSession) -> list[TopicRead]:
        result = await db.execute(select(Topic).order_by(Topic.created_at.desc()))
        return [self._topic_read(t) for t in result.scalars().all()]

    async def discover_sources(self, db: AsyncSession, topic_id: str, limit: int = 8) -> list[SourceRecord]:
        topic = await db.get(Topic, topic_id)
        if not topic:
            topic = Topic(id=topic_id, name=topic_id.replace("_", " ").title(), entities=[], watch_types=[])
            db.add(topic)
            await db.commit()
        query_terms = [topic.name] + (topic.entities or []) + (topic.watch_types or [])
        query = " ".join([x for x in query_terms if x]) or topic_id
        results = await self.brightdata.serp_search(query)
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

    async def refresh_topic(self, db: AsyncSession, topic_id: str, max_sources: int = 8) -> dict[str, Any]:
        run_id = str(uuid.uuid4())
        run = RefreshRun(id=run_id, topic_id=topic_id, status="running")
        db.add(run)
        await db.commit()
        await self.discover_sources(db, topic_id, limit=max_sources)
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
        return {"run_id": run_id, "topic_id": topic_id, "sources_checked": checked, "records_created": created, "status": run.status}

    async def extract_and_store(self, db: AsyncSession, topic_id: str, source: Source) -> IntelligenceRecordRead | None:
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
            return None
        facts = response.data
        entity_name = facts.get("company") or source.title or "Unknown"
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
        self.graph.upsert_intelligence_record({
            "entity_name": payload.entity_name,
            "source_url": payload.source_url,
            "source_type": payload.source_type,
            "facts": payload.facts,
            "last_checked": payload.last_checked,
        })
        return payload

    async def retrieve_context(self, db: AsyncSession, req: RetrievalRequest) -> list[RetrievalResult]:
        stmt = select(IntelligenceRecord)
        if req.topic_id:
            stmt = stmt.where(IntelligenceRecord.topic_id == req.topic_id)
        result = await db.execute(stmt)
        records = result.scalars().all()
        scored: list[RetrievalResult] = []
        query_terms = set(req.query.lower().split())
        for rec in records:
            score, reasons = self._score_record(rec, query_terms, req)
            scored.append(RetrievalResult(record=self._record_read(rec), score=score, reasons=reasons))
        scored.sort(key=lambda x: x.score, reverse=True)
        return scored[: req.top_k]

    async def list_records(self, db: AsyncSession, topic_id: str | None = None) -> list[IntelligenceRecordRead]:
        stmt = select(IntelligenceRecord).order_by(IntelligenceRecord.extracted_at.desc())
        if topic_id:
            stmt = stmt.where(IntelligenceRecord.topic_id == topic_id)
        result = await db.execute(stmt)
        return [self._record_read(r) for r in result.scalars().all()]

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
        text = " ".join([rec.entity_name or "", rec.summary or "", str(rec.facts_json or {})]).lower()
        overlap = len(query_terms.intersection(text.split())) / max(len(query_terms), 1)
        semantic_score = min(1.0, overlap + (0.15 if any(t in text for t in query_terms) else 0))
        entity_match = 1.0 if any(e.lower() in text for e in req.entities) else 0.0
        fresh = 1.0 if freshness_status(rec.last_checked, req.freshness_required_days) == "fresh" else 0.2
        authority = 0.9 if rec.source_type in {"pricing_page", "docs_page", "company_page"} else 0.6
        confidence = rec.confidence or 0.0
        score = 0.35 * semantic_score + 0.20 * entity_match + 0.15 * fresh + 0.10 * authority + 0.20 * confidence
        reasons = []
        if semantic_score > 0.2:
            reasons.append("semantic_match")
        if entity_match:
            reasons.append("entity_match")
        if fresh >= 1.0:
            reasons.append("fresh")
        if confidence > 0.7:
            reasons.append("high_confidence")
        return round(score, 4), reasons

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
