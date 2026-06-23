"""Neo4j relationship intelligence layer for WebDataOS.

Full graph model:
  - Node types: Workspace, Entity (Vendor/Competitor/Company/Regulation/Supplier/Account/Market),
                IntelligenceRecord, Source, Signal, Risk, IntelligenceRun,
                WorkflowAction, Recommendation, MemoryRecord
  - Relationships capture the full intelligence loop:
      Workspace → Entity → Signal → Risk → Action
      IntelligenceRun → Evidence → Source
      Cross-entity co-occurrence relationships

PostgreSQL remains the source of truth. Neo4j stores the relationship view
that makes cross-entity intelligence queries possible.
"""
from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

from neo4j import GraphDatabase

from packages.common.config import get_settings
from packages.common.logging import get_logger
from packages.schemas.intelligence import (
    GraphNode, GraphRelationship, GraphSnapshot, GraphStatus,
)

logger = get_logger(__name__)

# Maps entity_type field values to Neo4j node labels
ENTITY_LABEL_MAP = {
    "vendor": "Vendor",
    "competitor": "Competitor",
    "company": "Company",
    "regulation": "Regulation",
    "supplier": "Supplier",
    "account": "Account",
    "market": "Market",
    "domain": "Domain",
    "regulator": "Regulator",
    "security_page": "Domain",
}

# Node type colours for frontend rendering hints
NODE_COLORS = {
    "Workspace": "#12b5cb",
    "Vendor": "#ef4444",
    "Competitor": "#3b82f6",
    "Company": "#8b5cf6",
    "Regulation": "#f59e0b",
    "Supplier": "#f97316",
    "Account": "#22c55e",
    "Market": "#06b6d4",
    "Domain": "#64748b",
    "Regulator": "#a855f7",
    "Signal": "#fbbf24",
    "Risk": "#dc2626",
    "IntelligenceRecord": "#475569",
    "Source": "#334155",
    "IntelligenceRun": "#0ea5e9",
    "WorkflowAction": "#10b981",
    "Recommendation": "#818cf8",
    "MemoryRecord": "#94a3b8",
}


class Neo4jGraphClient:
    """Production relationship intelligence graph for WebDataOS.

    Writes the full intelligence loop into Neo4j so agents can answer
    cross-entity relationship questions that plain PostgreSQL queries cannot:
      - Which vendors share a breach signal?
      - Which competitors moved pricing and hired at the same time?
      - Which signals keep affecting the same entity across multiple runs?
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        self.configured = self.settings.neo4j_enabled
        self.enabled = self.configured
        self.driver = None
        self.message: str | None = None
        if self.enabled:
            try:
                self.driver = GraphDatabase.driver(
                    self.settings.neo4j_uri,
                    auth=(
                        self.settings.neo4j_username or self.settings.neo4j_user,
                        self.settings.neo4j_password,
                    ),
                    connection_timeout=5,
                    max_transaction_retry_time=3,
                )
                self.ensure_schema()
            except Exception as exc:
                self.enabled = False
                self.message = str(exc)
                logger.warning("neo4j_init_failed", error=str(exc)[:300])

    def close(self) -> None:
        if self.driver:
            self.driver.close()

    def health(self) -> str:
        if not self.configured:
            return "disabled"
        if not self.driver:
            return "error"
        try:
            with self._session() as session:
                session.run("RETURN 1").single()
            return "ok"
        except Exception as exc:
            self.message = str(exc)
            return "error"

    def status(self, tenant_id: str | None = None) -> GraphStatus:
        status = self.health()
        if status != "ok":
            return GraphStatus(status=status, enabled=self.configured, message=self.message)
        try:
            with self._session() as session:
                counts = session.execute_read(self._counts_tx, tenant_id)
                top_entities = session.execute_read(self._top_entities_tx, tenant_id)
                signal_summary = session.execute_read(self._signal_summary_tx, tenant_id)
            return GraphStatus(
                status="ok",
                enabled=True,
                counts=counts,
                top_entities=top_entities,
                signal_summary=signal_summary,
            )
        except Exception as exc:
            logger.warning("neo4j_status_failed", error=str(exc)[:300])
            return GraphStatus(status="error", enabled=True, message=str(exc))

    def ensure_schema(self) -> None:
        if not self.enabled or not self.driver:
            return
        legacy = [
            "webdataos_company_name", "webdataos_source_url",
            "webdataos_product_name", "webdataos_feature_name",
            "webdataos_pricing_name", "webdataos_company_scoped_id",
            "webdataos_source_scoped_id", "webdataos_product_scoped_id",
            "webdataos_feature_scoped_id", "webdataos_pricing_scoped_id",
        ]
        constraints = [
            "CREATE CONSTRAINT wdos_workspace_id IF NOT EXISTS FOR (w:Workspace) REQUIRE w.id IS UNIQUE",
            "CREATE CONSTRAINT wdos_entity_scoped_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.scoped_id IS UNIQUE",
            "CREATE CONSTRAINT wdos_record_id IF NOT EXISTS FOR (r:IntelligenceRecord) REQUIRE r.id IS UNIQUE",
            "CREATE CONSTRAINT wdos_source_scoped IF NOT EXISTS FOR (s:Source) REQUIRE s.scoped_id IS UNIQUE",
            "CREATE CONSTRAINT wdos_signal_id IF NOT EXISTS FOR (s:Signal) REQUIRE s.id IS UNIQUE",
            "CREATE CONSTRAINT wdos_risk_id IF NOT EXISTS FOR (r:Risk) REQUIRE r.id IS UNIQUE",
            "CREATE CONSTRAINT wdos_run_id IF NOT EXISTS FOR (r:IntelligenceRun) REQUIRE r.run_id IS UNIQUE",
            "CREATE CONSTRAINT wdos_action_id IF NOT EXISTS FOR (a:WorkflowAction) REQUIRE a.id IS UNIQUE",
            "CREATE CONSTRAINT wdos_rec_id IF NOT EXISTS FOR (r:Recommendation) REQUIRE r.id IS UNIQUE",
        ]
        indexes = [
            "CREATE INDEX wdos_entity_name IF NOT EXISTS FOR (e:Entity) ON (e.name)",
            "CREATE INDEX wdos_entity_type IF NOT EXISTS FOR (e:Entity) ON (e.entity_type)",
            "CREATE INDEX wdos_entity_tenant IF NOT EXISTS FOR (e:Entity) ON (e.tenant_id)",
            "CREATE INDEX wdos_signal_type IF NOT EXISTS FOR (s:Signal) ON (s.signal_type)",
            "CREATE INDEX wdos_signal_tenant IF NOT EXISTS FOR (s:Signal) ON (s.tenant_id)",
            "CREATE INDEX wdos_risk_posture IF NOT EXISTS FOR (r:Risk) ON (r.risk_posture)",
            "CREATE INDEX wdos_run_tenant IF NOT EXISTS FOR (r:IntelligenceRun) ON (r.tenant_id)",
        ]
        with self._session() as session:
            for name in legacy:
                try:
                    session.run(f"DROP CONSTRAINT {name} IF EXISTS")
                except Exception:
                    pass
            for stmt in constraints + indexes:
                try:
                    session.run(stmt)
                except Exception as exc:
                    logger.warning("neo4j_schema_stmt_failed", stmt=stmt[:80], error=str(exc)[:100])

    # ── Primary write: full intelligence run ─────────────────────────────

    def write_run(self, run_data: dict[str, Any]) -> None:
        """Write a complete intelligence run into the graph.

        Writes: IntelligenceRun → Workspace, Entity, IntelligenceRecord,
                Source, Signal, Risk, WorkflowAction, Recommendation nodes
                and all connecting relationships.
        """
        if not self.enabled or not self.driver:
            return
        try:
            with self._session() as session:
                session.execute_write(self._write_run_tx, run_data)
        except Exception as exc:
            logger.warning("neo4j_write_run_failed", error=str(exc)[:300], run_id=run_data.get("run_id"))

    @staticmethod
    def _write_run_tx(tx, run_data: dict[str, Any]) -> None:
        tenant_id = run_data.get("tenant_id", "tenant_internal")
        topic_id = run_data.get("topic_id", "unknown")
        run_id = run_data.get("run_id")
        package_id = run_data.get("package_id", "enterprise")
        created_at = run_data.get("created_at", "")
        task = run_data.get("task", "")
        risk_posture = run_data.get("risk_posture", "stable")
        confidence = run_data.get("confidence", 0.0)

        # Workspace node — store display_name stripped of tenant/workspace prefixes
        _ws_display = re.sub(r"^[a-z0-9_-]+_workspace_", "", topic_id, flags=re.IGNORECASE)
        _ws_display = re.sub(r"^workspace_", "", _ws_display, flags=re.IGNORECASE)
        _ws_display = _ws_display.replace("_", " ").title() or topic_id
        tx.run(
            "MERGE (w:Workspace {id: $id}) SET w.tenant_id=$tid, w.package_id=$pkg, w.name=$dname, w.topic_id=$id",
            id=topic_id, tid=tenant_id, pkg=package_id, dname=_ws_display,
        )

        # IntelligenceRun node
        tx.run(
            """
            MERGE (r:IntelligenceRun {run_id: $run_id})
            SET r.tenant_id=$tid, r.topic_id=$topic_id, r.task=$task,
                r.package_id=$pkg, r.risk_posture=$posture,
                r.confidence=$conf, r.created_at=$created_at, r.status='success'
            WITH r
            MATCH (w:Workspace {id: $topic_id})
            MERGE (w)-[:HAS_RUN]->(r)
            """,
            run_id=run_id, tid=tenant_id, topic_id=topic_id, task=task[:500],
            pkg=package_id, posture=risk_posture, conf=confidence,
            created_at=str(created_at),
        )

        # Evidence records + entities + sources
        for rec in run_data.get("records", []):
            entity_name = rec.get("entity_name") or "Unknown"
            entity_type = rec.get("entity_type") or "company"
            label = ENTITY_LABEL_MAP.get(entity_type.lower(), "Company")
            source_url = rec.get("source_url", "")
            rec_id = rec.get("id", "")
            tenant_entity_id = f"{tenant_id}:{entity_name}"
            source_scoped = f"{tenant_id}:{source_url}"

            # Entity node (typed label + base :Entity label)
            tx.run(
                f"""
                MERGE (e:Entity {{scoped_id: $scoped_id}})
                SET e:{label}, e.name=$name, e.entity_type=$etype,
                    e.tenant_id=$tid, e.color=$color
                WITH e
                MATCH (w:Workspace {{id: $topic_id}})
                MERGE (w)-[:MONITORS]->(e)
                """,
                scoped_id=tenant_entity_id, name=entity_name, etype=entity_type,
                tid=tenant_id, topic_id=topic_id,
                color=NODE_COLORS.get(label, "#8b5cf6"),
            )

            # IntelligenceRecord node
            if rec_id:
                tx.run(
                    """
                    MERGE (ir:IntelligenceRecord {id: $id})
                    SET ir.summary=$summary, ir.entity_name=$ename, ir.confidence=$conf,
                        ir.freshness_status=$fresh, ir.source_type=$stype,
                        ir.tenant_id=$tid, ir.topic_id=$topic_id
                    WITH ir
                    MATCH (e:Entity {scoped_id: $entity_id})
                    MERGE (ir)-[:MENTIONS]->(e)
                    WITH ir
                    MATCH (r:IntelligenceRun {run_id: $run_id})
                    MERGE (r)-[:RETRIEVED]->(ir)
                    """,
                    id=rec_id, summary=(rec.get("summary") or "")[:500],
                    ename=entity_name,
                    conf=rec.get("confidence", 0.0),
                    fresh=rec.get("freshness_status", "unknown"),
                    stype=rec.get("source_type", "unknown"),
                    tid=tenant_id, topic_id=topic_id,
                    entity_id=tenant_entity_id, run_id=run_id,
                )

            # Source node
            if source_url:
                source_tier = rec.get("source_tier") or 3
                tx.run(
                    """
                    MERGE (s:Source {scoped_id: $scoped_id})
                    SET s.url=$url, s.source_type=$stype, s.tenant_id=$tid, s.tier=$tier
                    WITH s
                    MATCH (ir:IntelligenceRecord {id: $rec_id})
                    MERGE (ir)-[:FROM_SOURCE]->(s)
                    """,
                    scoped_id=source_scoped, url=source_url,
                    stype=rec.get("source_type", "unknown"),
                    tid=tenant_id, rec_id=rec_id, tier=source_tier,
                ) if rec_id else tx.run(
                    "MERGE (s:Source {scoped_id: $scoped_id}) SET s.url=$url, s.tenant_id=$tid, s.tier=$tier",
                    scoped_id=source_scoped, url=source_url, tid=tenant_id, tier=source_tier,
                )

        # Signal nodes from materiality assessments
        for assessment in run_data.get("materiality_assessments", []):
            signal_id = assessment.get("signal_id") or f"sig:{run_id}:{assessment.get('finding', '')[:40]}"
            signal_type = assessment.get("signal_type", "informational")
            materiality = assessment.get("materiality", "informational")
            for entity_name in (assessment.get("affected_entities") or []):
                tenant_entity_id = f"{tenant_id}:{entity_name}"
                tx.run(
                    """
                    MERGE (sig:Signal {id: $id})
                    SET sig.signal_type=$stype, sig.materiality=$mat,
                        sig.finding=$finding, sig.tenant_id=$tid,
                        sig.detected_at=$created_at, sig.urgency=$urgency
                    WITH sig
                    MATCH (e:Entity {scoped_id: $entity_id})
                    MERGE (sig)-[:AFFECTS]->(e)
                    WITH sig
                    MATCH (r:IntelligenceRun {run_id: $run_id})
                    MERGE (r)-[:DETECTED]->(sig)
                    """,
                    id=signal_id, stype=signal_type, mat=materiality,
                    finding=(assessment.get("finding") or "")[:300],
                    tid=tenant_id, created_at=str(created_at),
                    urgency=assessment.get("urgency", "standard"),
                    entity_id=tenant_entity_id, run_id=run_id,
                )

        # Risk node from risk posture
        if risk_posture not in {"stable", "unknown"}:
            risk_id = f"risk:{run_id}"
            tx.run(
                """
                MERGE (rk:Risk {id: $id})
                SET rk.risk_posture=$posture, rk.confidence=$conf,
                    rk.tenant_id=$tid, rk.topic_id=$topic_id,
                    rk.financial_impact=$impact, rk.created_at=$created_at
                WITH rk
                MATCH (r:IntelligenceRun {run_id: $run_id})
                MERGE (r)-[:PRODUCED]->(rk)
                WITH rk
                MATCH (w:Workspace {id: $topic_id})
                MERGE (w)-[:HAS_RISK]->(rk)
                """,
                id=risk_id, posture=risk_posture, conf=confidence,
                tid=tenant_id, topic_id=topic_id,
                impact=run_data.get("total_financial_impact", 0.0),
                created_at=str(created_at), run_id=run_id,
            )

        # Recommendation nodes
        for rec_data in run_data.get("recommendations", []):
            rec_id = rec_data.get("id", "")
            if not rec_id:
                continue
            tx.run(
                """
                MERGE (rc:Recommendation {id: $id})
                SET rc.title=$title, rc.materiality=$mat,
                    rc.confidence=$conf, rc.tenant_id=$tid,
                    rc.framework_used=$fw
                WITH rc
                MATCH (r:IntelligenceRun {run_id: $run_id})
                MERGE (r)-[:RECOMMENDED]->(rc)
                """,
                id=rec_id, title=(rec_data.get("title") or "")[:300],
                mat=rec_data.get("materiality", "informational"),
                conf=rec_data.get("confidence", 0.0),
                tid=tenant_id, fw=rec_data.get("framework_used", ""),
                run_id=run_id,
            )
            for entity_name in (rec_data.get("affected_entities") or []):
                tenant_entity_id = f"{tenant_id}:{entity_name}"
                tx.run(
                    """
                    MATCH (rc:Recommendation {id: $rec_id})
                    MATCH (e:Entity {scoped_id: $entity_id})
                    MERGE (rc)-[:CONCERNS]->(e)
                    """,
                    rec_id=rec_id, entity_id=tenant_entity_id,
                )

        # WorkflowAction nodes from autonomous actions
        for action in run_data.get("autonomous_actions", []):
            action_id = action.get("id", "")
            if not action_id:
                continue
            tx.run(
                """
                MERGE (a:WorkflowAction {id: $id})
                SET a.action_type=$atype, a.title=$title,
                    a.status=$status, a.urgency=$urgency,
                    a.tenant_id=$tid, a.topic_id=$topic_id
                WITH a
                MATCH (r:IntelligenceRun {run_id: $run_id})
                MERGE (r)-[:TRIGGERED]->(a)
                """,
                id=action_id, atype=action.get("action_type", "unknown"),
                title=(action.get("title") or "")[:300],
                status=action.get("status", "pending_approval"),
                urgency=action.get("urgency", "standard"),
                tid=tenant_id, topic_id=topic_id, run_id=run_id,
            )
            for entity_name in (action.get("payload", {}).get("entities") or []):
                tenant_entity_id = f"{tenant_id}:{entity_name}"
                tx.run(
                    """
                    MATCH (a:WorkflowAction {id: $action_id})
                    MATCH (e:Entity {scoped_id: $entity_id})
                    MERGE (a)-[:TARGETS]->(e)
                    """,
                    action_id=action_id, entity_id=tenant_entity_id,
                )

        # Real named entities from LLM extraction (Gap 1) — these are the meaningful nodes
        for ent in run_data.get("extracted_entities", []):
            ent_name = (ent.get("name") or "").strip()
            if not ent_name:
                continue
            ent_type = ent.get("type") or "company"
            label = ENTITY_LABEL_MAP.get(ent_type.lower(), "Company")
            scoped_id = f"{tenant_id}:{ent_name}"
            tx.run(
                f"""
                MERGE (e:Entity {{scoped_id: $scoped_id}})
                SET e:{label}, e.name=$name, e.entity_type=$etype,
                    e.tenant_id=$tid, e.color=$color,
                    e.latest_event=$event, e.event_type=$etype2,
                    e.severity=$severity
                WITH e
                MATCH (w:Workspace {{id: $topic_id}})
                MERGE (w)-[:MONITORS]->(e)
                WITH e
                MATCH (r:IntelligenceRun {{run_id: $run_id}})
                MERGE (r)-[:DETECTED_ENTITY]->(e)
                """,
                scoped_id=scoped_id, name=ent_name, etype=ent_type,
                tid=tenant_id, topic_id=topic_id, run_id=run_id,
                color=NODE_COLORS.get(label, "#8b5cf6"),
                event=(ent.get("event") or "")[:200],
                etype2=ent.get("event_type") or "other",
                severity=ent.get("severity") or "medium",
            )

        # Cross-entity co-occurrence — use extracted entities when available, fall back to record entities
        extracted_entity_names = [
            ent.get("name") for ent in run_data.get("extracted_entities", [])
            if ent.get("name")
        ]
        entity_names = extracted_entity_names or list({
            rec.get("entity_name") for rec in run_data.get("records", [])
            if rec.get("entity_name")
        })
        for i, a in enumerate(entity_names):
            for b in entity_names[i + 1:]:
                tx.run(
                    """
                    MATCH (ea:Entity {scoped_id: $a_id})
                    MATCH (eb:Entity {scoped_id: $b_id})
                    MERGE (ea)-[r:CO_OCCURS_WITH]-(eb)
                    ON CREATE SET r.count = 1, r.tenant_id = $tid
                    ON MATCH SET r.count = r.count + 1
                    """,
                    a_id=f"{tenant_id}:{a}",
                    b_id=f"{tenant_id}:{b}",
                    tid=tenant_id,
                )

    # ── Legacy backfill write (kept for backward compat) ─────────────────

    def upsert_intelligence_record(self, record: dict[str, Any]) -> None:
        """Backfill path: write a single evidence record into the graph."""
        if not self.enabled or not self.driver:
            return
        entity_name = record.get("entity_name") or record.get("facts", {}).get("company") or "Unknown"
        entity_type = record.get("entity_type") or "company"
        label = ENTITY_LABEL_MAP.get(entity_type.lower(), "Company")
        source_url = record.get("source_url") or "unknown"
        rec_id = record.get("id") or f"{record.get('topic_id')}:{source_url}:{entity_name}"
        topic_id = record.get("topic_id") or "unknown"
        tenant_id = record.get("tenant_id") or "tenant_internal"
        try:
            with self._session() as session:
                session.execute_write(
                    self._backfill_record_tx,
                    entity_name, label, source_url,
                    record.get("facts") or {},
                    {**record, "id": rec_id, "topic_id": topic_id, "tenant_id": tenant_id},
                )
        except Exception as exc:
            logger.warning("neo4j_backfill_failed", error=str(exc)[:200])

    @staticmethod
    def _backfill_record_tx(
        tx, entity_name: str, label: str, source_url: str,
        facts: dict[str, Any], record: dict[str, Any],
    ) -> None:
        tenant_id = record.get("tenant_id")
        topic_id = record.get("topic_id")
        entity_scoped = f"{tenant_id}:{entity_name}"
        source_scoped = f"{tenant_id}:{source_url}"
        tx.run(
            f"""
            MERGE (w:Workspace {{id: $topic_id}})
            SET w.topic_id=$topic_id, w.tenant_id=$tenant_id
            MERGE (e:Entity {{scoped_id: $entity_scoped}})
            SET e:{label}, e.name=$entity_name, e.tenant_id=$tenant_id,
                e.entity_type=$entity_type, e.color=$color
            MERGE (r:IntelligenceRecord {{id: $rec_id}})
            SET r.summary=$summary, r.entity_name=$entity_name, r.tenant_id=$tenant_id,
                r.topic_id=$topic_id, r.confidence=$confidence,
                r.freshness_status=$freshness, r.source_type=$source_type
            MERGE (s:Source {{scoped_id: $source_scoped}})
            SET s.url=$source_url, s.tenant_id=$tenant_id,
                s.source_type=$source_type, s.tier=$source_tier
            MERGE (w)-[:MONITORS]->(e)
            MERGE (w)-[:HAS_EVIDENCE]->(r)
            MERGE (e)-[:HAS_RECORD]->(r)
            MERGE (r)-[:MENTIONS]->(e)
            MERGE (r)-[:FROM_SOURCE]->(s)
            """,
            topic_id=topic_id, tenant_id=tenant_id,
            entity_scoped=entity_scoped, entity_name=entity_name,
            entity_type=record.get("entity_type", "company"),
            color=NODE_COLORS.get(label, "#8b5cf6"),
            rec_id=record.get("id"),
            summary=(record.get("summary") or "")[:500],
            confidence=record.get("confidence", 0.0),
            freshness=record.get("freshness_status", "unknown"),
            source_scoped=source_scoped, source_url=source_url,
            source_type=record.get("source_type", "unknown"),
            source_tier=record.get("source_tier") or 3,
        )

    @staticmethod
    def _upsert_tx(
        tx,
        entity_name: str,
        source_url: str,
        facts: dict[str, Any],
        record: dict[str, Any],
    ) -> None:
        """Enterprise fact projection: writes entity + record + derived nodes."""
        tenant_id = record.get("tenant_id", "tenant_internal")
        topic_id = record.get("topic_id", "unknown")
        rec_id = record.get("id", f"{topic_id}:{source_url}:{entity_name}")
        entity_type = record.get("entity_type", "company")
        label = ENTITY_LABEL_MAP.get(entity_type.lower(), "Company")
        company_scoped_id = f"{tenant_id}:{entity_name}"
        workspace_scoped_id = f"{tenant_id}:{topic_id}"
        _ws_d = re.sub(r"^[a-z0-9_-]+_workspace_", "", topic_id, flags=re.IGNORECASE)
        _ws_d = re.sub(r"^workspace_", "", _ws_d, flags=re.IGNORECASE)
        ws_display = _ws_d.replace("_", " ").title() or topic_id

        tx.run(
            f"""
            MERGE (w:Workspace {{scoped_id: $workspace_scoped_id}})
            SET w.id=$topic_id, w.name=$ws_display, w.tenant_id=$tenant_id
            MERGE (c:{label} {{scoped_id: $company_scoped_id}})
            SET c.name=$entity_name, c.tenant_id=$tenant_id, c.entity_type=$entity_type
            MERGE (r:IntelligenceRecord {{id: $rec_id}})
            SET r.entity_name=$entity_name, r.tenant_id=$tenant_id, r.topic_id=$topic_id,
                r.summary=$summary, r.confidence=$confidence,
                r.freshness_status=$freshness, r.source_type=$source_type
            MERGE (w)-[:MONITORS]->(c)
            MERGE (c)-[:HAS_RECORD]->(r)
            """,
            tenant_id=tenant_id,
            topic_id=topic_id,
            ws_display=ws_display,
            workspace_scoped_id=workspace_scoped_id,
            company_scoped_id=company_scoped_id,
            entity_name=entity_name,
            entity_type=entity_type,
            rec_id=rec_id,
            summary=(record.get("summary") or "")[:500],
            confidence=record.get("confidence", 0.0),
            freshness=record.get("freshness_status", "unknown"),
            source_type=record.get("source_type", "unknown"),
        )

        product = facts.get("product") or facts.get("products")
        if product:
            for p in ([product] if isinstance(product, str) else product):
                tx.run(
                    "MATCH (c {scoped_id: $cid}) "
                    "MERGE (p:Product {scoped_id: $pid}) SET p.name=$name, p.tenant_id=$tid "
                    "MERGE (c)-[:OFFERS]->(p)",
                    cid=company_scoped_id, pid=f"{tenant_id}:{p}", name=p, tid=tenant_id,
                )

        for feature in (facts.get("features") or []):
            tx.run(
                "MATCH (c {scoped_id: $cid}) "
                "MERGE (f:Feature {scoped_id: $fid}) SET f.name=$name, f.tenant_id=$tid "
                "MERGE (c)-[:HAS_FEATURE]->(f)",
                cid=company_scoped_id, fid=f"{tenant_id}:{feature}", name=feature, tid=tenant_id,
            )

        pricing = facts.get("pricing_model")
        if pricing:
            tx.run(
                "MATCH (c {scoped_id: $cid}) "
                "MERGE (pm:PricingModel {scoped_id: $pmid}) SET pm.name=$name, pm.tenant_id=$tid "
                "MERGE (c)-[:HAS_PRICING_MODEL]->(pm)",
                cid=company_scoped_id, pmid=f"{tenant_id}:{pricing}", name=pricing, tid=tenant_id,
            )

    # ── Query methods ─────────────────────────────────────────────────────

    def topic_graph(
        self, topic_id: str, limit: int = 120, tenant_id: str | None = None
    ) -> GraphSnapshot:
        if self.health() != "ok":
            return GraphSnapshot(status=self.health(), message=self.message)
        try:
            with self._session() as session:
                return session.execute_read(self._topic_graph_tx, topic_id, limit, tenant_id)
        except Exception as exc:
            logger.warning("neo4j_topic_graph_failed", error=str(exc)[:300])
            return GraphSnapshot(status="error", message=str(exc))

    def entity_neighborhood(
        self, entity: str, limit: int = 80, tenant_id: str | None = None
    ) -> GraphSnapshot:
        if self.health() != "ok":
            return GraphSnapshot(status=self.health(), message=self.message)
        try:
            with self._session() as session:
                return session.execute_read(self._entity_graph_tx, entity, limit, tenant_id)
        except Exception as exc:
            logger.warning("neo4j_entity_graph_failed", error=str(exc)[:300])
            return GraphSnapshot(status="error", message=str(exc))

    def signal_graph(
        self, signal_type: str | None = None, tenant_id: str | None = None, limit: int = 80
    ) -> GraphSnapshot:
        """Return a graph of signals, affected entities, and linked risks."""
        if self.health() != "ok":
            return GraphSnapshot(status=self.health(), message=self.message)
        try:
            with self._session() as session:
                return session.execute_read(self._signal_graph_tx, signal_type, tenant_id, limit)
        except Exception as exc:
            logger.warning("neo4j_signal_graph_failed", error=str(exc)[:300])
            return GraphSnapshot(status="error", message=str(exc))

    def cross_entity_graph(
        self, tenant_id: str | None = None, min_co_occurrences: int = 1, limit: int = 100
    ) -> GraphSnapshot:
        """Return entity co-occurrence graph showing which entities appear together."""
        if self.health() != "ok":
            return GraphSnapshot(status=self.health(), message=self.message)
        try:
            with self._session() as session:
                return session.execute_read(
                    self._cross_entity_tx, tenant_id, min_co_occurrences, limit
                )
        except Exception as exc:
            logger.warning("neo4j_cross_entity_failed", error=str(exc)[:300])
            return GraphSnapshot(status="error", message=str(exc))

    def run_lineage(
        self, run_id: str, tenant_id: str | None = None
    ) -> GraphSnapshot:
        """Full lineage graph for a single intelligence run."""
        if self.health() != "ok":
            return GraphSnapshot(status=self.health(), message=self.message)
        try:
            with self._session() as session:
                return session.execute_read(self._run_lineage_tx, run_id, tenant_id)
        except Exception as exc:
            logger.warning("neo4j_run_lineage_failed", error=str(exc)[:300])
            return GraphSnapshot(status="error", message=str(exc))

    # ── Transaction implementations ───────────────────────────────────────

    @classmethod
    def _topic_graph_tx(
        cls, tx, topic_id: str, limit: int, tenant_id: str | None
    ) -> GraphSnapshot:
        rows = tx.run(
            """
            MATCH (w:Workspace {id: $topic_id})
            WHERE $tenant_id IS NULL OR w.tenant_id = $tenant_id
            OPTIONAL MATCH (w)-[r1]->(n)
            WHERE $tenant_id IS NULL OR n.tenant_id = $tenant_id
            OPTIONAL MATCH (n)-[r2]->(m)
            WHERE m IS NULL OR $tenant_id IS NULL OR m.tenant_id = $tenant_id
            OPTIONAL MATCH (n)-[r3:CO_OCCURS_WITH]-(co)
            WHERE co IS NULL OR $tenant_id IS NULL OR co.tenant_id = $tenant_id
            RETURN w, r1, n, r2, m, r3, co
            LIMIT $limit
            """,
            topic_id=topic_id, tenant_id=tenant_id, limit=limit,
        )
        return cls._snapshot_from_rows(rows, "ok")

    @classmethod
    def _entity_graph_tx(
        cls, tx, entity: str, limit: int, tenant_id: str | None
    ) -> GraphSnapshot:
        # Match Entity nodes (both :Entity-labeled and typed Company/Vendor/etc)
        entity_labels = ['Entity', 'Company', 'Vendor', 'Competitor', 'Supplier',
                         'Account', 'Market', 'Domain', 'Regulator', 'Product']
        rows = tx.run(
            """
            MATCH (e)
            WHERE any(l IN labels(e) WHERE l IN $entity_labels)
              AND toLower(e.name) = toLower($entity)
              AND ($tenant_id IS NULL OR e.tenant_id = $tenant_id)
            OPTIONAL MATCH (e)-[r1]-(n)
            WHERE n IS NULL OR $tenant_id IS NULL OR n.tenant_id = $tenant_id
            OPTIONAL MATCH (n)-[r2]-(m)
            WHERE m IS NULL OR $tenant_id IS NULL OR m.tenant_id = $tenant_id
            RETURN e, r1, n, r2, m
            LIMIT $limit
            """,
            entity=entity, tenant_id=tenant_id, limit=limit,
            entity_labels=entity_labels,
        )
        snap = cls._snapshot_from_rows(rows, "ok")
        if snap.nodes:
            return snap
        # Fuzzy fallback: partial name match across all entity-type nodes
        rows2 = tx.run(
            """
            MATCH (e)
            WHERE any(l IN labels(e) WHERE l IN $entity_labels)
              AND toLower(e.name) CONTAINS toLower($entity)
              AND ($tenant_id IS NULL OR e.tenant_id = $tenant_id)
            OPTIONAL MATCH (e)-[r1]-(n)
            WHERE n IS NULL OR $tenant_id IS NULL OR n.tenant_id = $tenant_id
            RETURN e, r1, n
            LIMIT $limit
            """,
            entity=entity, tenant_id=tenant_id, limit=limit,
            entity_labels=entity_labels,
        )
        return cls._snapshot_from_rows(rows2, "ok")

    @classmethod
    def _signal_graph_tx(
        cls, tx, signal_type: str | None, tenant_id: str | None, limit: int
    ) -> GraphSnapshot:
        rows = tx.run(
            """
            MATCH (sig:Signal)
            WHERE ($tenant_id IS NULL OR sig.tenant_id = $tenant_id)
              AND ($signal_type IS NULL OR sig.signal_type = $signal_type)
            OPTIONAL MATCH (sig)-[r1:AFFECTS]->(e:Entity)
            WHERE e IS NULL OR $tenant_id IS NULL OR e.tenant_id = $tenant_id
            OPTIONAL MATCH (sig)-[r2:PRODUCED|CREATES]->(rk:Risk)
            WHERE rk IS NULL OR $tenant_id IS NULL OR rk.tenant_id = $tenant_id
            OPTIONAL MATCH (run:IntelligenceRun)-[r3:DETECTED]->(sig)
            WHERE run IS NULL OR $tenant_id IS NULL OR run.tenant_id = $tenant_id
            RETURN sig, r1, e, r2, rk, r3, run
            LIMIT $limit
            """,
            tenant_id=tenant_id, signal_type=signal_type, limit=limit,
        )
        return cls._snapshot_from_rows(rows, "ok")

    @classmethod
    def _cross_entity_tx(
        cls, tx, tenant_id: str | None, min_co: int, limit: int
    ) -> GraphSnapshot:
        # Try CO_OCCURS_WITH edges (created when entities co-appear in a run)
        co_rows = list(tx.run(
            """
            MATCH (ea:Entity)-[r:CO_OCCURS_WITH]-(eb:Entity)
            WHERE r.count >= $min_co
              AND ($tenant_id IS NULL OR ea.tenant_id = $tenant_id)
              AND ($tenant_id IS NULL OR eb.tenant_id = $tenant_id)
            RETURN ea, r, eb
            ORDER BY r.count DESC
            LIMIT $limit
            """,
            tenant_id=tenant_id, min_co=min_co, limit=limit,
        ))
        if co_rows:
            return cls._snapshot_from_rows(iter(co_rows), "ok")

        # Fallback: entities co-monitored in the same workspace (works for both
        # :Entity-labeled nodes and typed Company/Vendor/etc without :Entity)
        entity_labels = ['Entity', 'Company', 'Vendor', 'Competitor', 'Supplier',
                         'Account', 'Market', 'Domain', 'Regulator', 'Product']
        ws_rows = tx.run(
            """
            MATCH (w:Workspace)-[:MONITORS]->(ea)
            MATCH (w)-[:MONITORS]->(eb)
            WHERE ea <> eb
              AND any(la IN labels(ea) WHERE la IN $entity_labels)
              AND any(lb IN labels(eb) WHERE lb IN $entity_labels)
              AND ($tenant_id IS NULL OR w.tenant_id = $tenant_id)
            OPTIONAL MATCH (ea)-[ra:HAS_RECORD]->(rec_a:IntelligenceRecord)
            OPTIONAL MATCH (eb)-[rb:HAS_RECORD]->(rec_b:IntelligenceRecord)
            RETURN ea, eb, w, rec_a, rec_b
            LIMIT $limit
            """,
            tenant_id=tenant_id, limit=limit, entity_labels=entity_labels,
        )
        return cls._snapshot_from_rows(ws_rows, "ok")

    @classmethod
    def _run_lineage_tx(
        cls, tx, run_id: str, tenant_id: str | None
    ) -> GraphSnapshot:
        rows = tx.run(
            """
            MATCH (r:IntelligenceRun {run_id: $run_id})
            WHERE $tenant_id IS NULL OR r.tenant_id = $tenant_id
            OPTIONAL MATCH (r)-[rel1]->(n)
            OPTIONAL MATCH (n)-[rel2]->(m)
            RETURN r, rel1, n, rel2, m
            LIMIT 200
            """,
            run_id=run_id, tenant_id=tenant_id,
        )
        return cls._snapshot_from_rows(rows, "ok")

    @staticmethod
    def _counts_tx(tx, tenant_id: str | None = None) -> dict[str, int]:
        rows = tx.run(
            """
            MATCH (n)
            WHERE $tenant_id IS NULL OR n.tenant_id = $tenant_id
            WITH labels(n)[0] AS label, count(n) AS cnt
            WITH collect({label: label, count: cnt}) AS labels
            OPTIONAL MATCH ()-[r]->()
            RETURN labels, count(r) AS relationships
            """,
            tenant_id=tenant_id,
        ).single()
        if not rows:
            return {}
        counts = {item["label"] or "Unknown": item["count"] for item in rows["labels"]}
        counts["relationships"] = rows["relationships"]
        return counts

    @staticmethod
    def _top_entities_tx(tx, tenant_id: str | None = None) -> list[dict[str, Any]]:
        rows = tx.run(
            """
            MATCH (e:Entity)
            WHERE $tenant_id IS NULL OR e.tenant_id = $tenant_id
            OPTIONAL MATCH (e)-[r]-()
            RETURN e.name AS name, e.entity_type AS entity_type,
                   count(r) AS degree
            ORDER BY degree DESC, name ASC
            LIMIT 15
            """,
            tenant_id=tenant_id,
        )
        return [
            {"name": row["name"], "entity_type": row["entity_type"], "degree": row["degree"]}
            for row in rows
        ]

    @staticmethod
    def _signal_summary_tx(tx, tenant_id: str | None = None) -> list[dict[str, Any]]:
        rows = tx.run(
            """
            MATCH (s:Signal)
            WHERE $tenant_id IS NULL OR s.tenant_id = $tenant_id
            WITH s.signal_type AS signal_type, s.materiality AS materiality,
                 count(s) AS cnt
            RETURN signal_type, materiality, cnt
            ORDER BY cnt DESC
            LIMIT 20
            """,
            tenant_id=tenant_id,
        )
        return [
            {"signal_type": row["signal_type"], "materiality": row["materiality"], "count": row["cnt"]}
            for row in rows
        ]

    @staticmethod
    def _snapshot_from_rows(rows, status: str) -> GraphSnapshot:
        nodes: dict[str, GraphNode] = {}
        relationships: dict[tuple[str, str, str], GraphRelationship] = {}

        def add_node(node) -> str | None:
            if node is None:
                return None
            labels = list(node.labels)
            # Pick most specific label (non-Entity base label first)
            node_type = next(
                (lbl for lbl in labels if lbl != "Entity"),
                labels[0] if labels else "Node",
            )
            props = dict(node)

            # Build a human-readable display label per node type
            if node_type == "IntelligenceRecord":
                summary = props.get("summary") or ""
                entity = props.get("entity_name") or ""
                raw_id = props.get("id") or str(node.element_id)
                # Show entity + truncated summary when available
                if summary and entity:
                    display_label = f"{entity}: {summary[:55]}"
                elif summary:
                    display_label = summary[:60]
                else:
                    display_label = f"Record {raw_id[:8]}"
                stable_id = raw_id  # stable dedup key
            elif node_type == "Workspace":
                raw = props.get("name") or props.get("id") or str(node.element_id)
                clean = re.sub(r"^[a-z0-9_-]+_workspace_", "", raw, flags=re.IGNORECASE)
                clean = re.sub(r"^workspace_", "", clean, flags=re.IGNORECASE)
                display_label = clean.replace("_", " ").title() or raw
                stable_id = raw
            elif node_type == "Signal":
                finding = props.get("finding") or ""
                sig_type = props.get("signal_type") or ""
                if finding:
                    prefix = f"[{sig_type}] " if sig_type else ""
                    display_label = prefix + finding[:55]
                else:
                    display_label = props.get("id") or str(node.element_id)
                stable_id = props.get("id") or str(node.element_id)
            elif node_type == "Risk":
                posture = props.get("risk_posture") or "unknown"
                topic = props.get("topic_id") or ""
                clean_topic = re.sub(r"^[a-z0-9_-]+_workspace_", "", topic, flags=re.IGNORECASE)
                clean_topic = re.sub(r"^workspace_", "", clean_topic, flags=re.IGNORECASE)
                display_label = f"{posture.title()} risk — {clean_topic.replace('_',' ').title()}"
                stable_id = props.get("id") or str(node.element_id)
            elif node_type == "Recommendation":
                title = props.get("title") or ""
                display_label = title[:60] if title else "Recommendation"
                stable_id = props.get("id") or str(node.element_id)
            elif node_type == "IntelligenceRun":
                task = props.get("task") or ""
                run_id = props.get("run_id") or str(node.element_id)
                display_label = task[:55] if task else f"Run {run_id[:8]}"
                stable_id = run_id
            elif node_type == "Source":
                url = props.get("url") or props.get("scoped_id") or str(node.element_id)
                try:
                    p = urlparse(url)
                    domain = p.netloc.lstrip("www.")
                    path_parts = [x for x in p.path.split("/") if x]
                    display_label = domain + ("/" + path_parts[0] if path_parts else "")
                except Exception:
                    display_label = url[:60]
                stable_id = url
            else:
                display_label = (
                    props.get("name")
                    or props.get("title")
                    or props.get("run_id")
                    or props.get("id")
                    or str(node.element_id)
                )
                stable_id = display_label

            node_id = f"{node_type}:{stable_id}"
            color = props.get("color") or NODE_COLORS.get(node_type, "#64748b")
            nodes[node_id] = GraphNode(
                id=node_id,
                label=str(display_label)[:80],
                type=node_type,
                properties={**props, "color": color},
            )
            return node_id

        def add_rel(rel, start_id: str | None = None, end_id: str | None = None) -> None:
            if rel is None:
                return
            source = start_id or add_node(rel.start_node)
            target = end_id or add_node(rel.end_node)
            if not source or not target or source == target:
                return
            key = (source, target, rel.type)
            relationships[key] = GraphRelationship(
                source=source, target=target, type=rel.type,
                properties=dict(rel),
            )

        for row in rows:
            values = dict(row)
            for value in values.values():
                if hasattr(value, "labels"):
                    add_node(value)
                elif hasattr(value, "type") and hasattr(value, "start_node"):
                    add_rel(value)

        return GraphSnapshot(
            status=status,
            nodes=list(nodes.values()),
            relationships=list(relationships.values()),
            counts={"nodes": len(nodes), "relationships": len(relationships)},
        )

    def _session(self):
        if self.settings.neo4j_database:
            return self.driver.session(database=self.settings.neo4j_database)
        return self.driver.session()
