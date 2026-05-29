from __future__ import annotations

from typing import Any

from neo4j import GraphDatabase

from packages.common.config import get_settings
from packages.common.logging import get_logger
from packages.schemas.intelligence import GraphNode, GraphRelationship, GraphSnapshot, GraphStatus

logger = get_logger(__name__)


class Neo4jGraphClient:
    """Optional enterprise graph projection for evidence, entities, and sources.

    PostgreSQL remains the source of truth. Neo4j stores the relationship view
    that analysts need for entity neighborhoods, evidence lineage, and graph UI.
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
                    auth=(self.settings.neo4j_username or self.settings.neo4j_user, self.settings.neo4j_password),
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
            return GraphStatus(status="ok", enabled=True, counts=counts, top_entities=top_entities)
        except Exception as exc:
            logger.warning("neo4j_status_failed", error=str(exc)[:300])
            return GraphStatus(status="error", enabled=True, message=str(exc))

    def ensure_schema(self) -> None:
        if not self.enabled or not self.driver:
            return
        legacy_constraints = [
            "webdataos_company_name",
            "webdataos_source_url",
            "webdataos_product_name",
            "webdataos_feature_name",
            "webdataos_pricing_name",
        ]
        constraints = [
            "CREATE CONSTRAINT webdataos_workspace_id IF NOT EXISTS FOR (w:Workspace) REQUIRE w.id IS UNIQUE",
            "CREATE CONSTRAINT webdataos_company_scoped_id IF NOT EXISTS FOR (c:Company) REQUIRE c.scoped_id IS UNIQUE",
            "CREATE CONSTRAINT webdataos_source_scoped_id IF NOT EXISTS FOR (s:Source) REQUIRE s.scoped_id IS UNIQUE",
            "CREATE CONSTRAINT webdataos_record_id IF NOT EXISTS FOR (r:IntelligenceRecord) REQUIRE r.id IS UNIQUE",
            "CREATE CONSTRAINT webdataos_product_scoped_id IF NOT EXISTS FOR (p:Product) REQUIRE p.scoped_id IS UNIQUE",
            "CREATE CONSTRAINT webdataos_feature_scoped_id IF NOT EXISTS FOR (f:Feature) REQUIRE f.scoped_id IS UNIQUE",
            "CREATE CONSTRAINT webdataos_pricing_scoped_id IF NOT EXISTS FOR (p:PricingModel) REQUIRE p.scoped_id IS UNIQUE",
        ]
        with self._session() as session:
            for name in legacy_constraints:
                session.run(f"DROP CONSTRAINT {name} IF EXISTS")
            for query in constraints:
                session.run(query)

    def upsert_intelligence_record(self, record: dict[str, Any]) -> None:
        if not self.enabled or not self.driver:
            return
        entity = record.get("entity_name") or record.get("facts", {}).get("company") or "Unknown"
        source_url = record.get("source_url") or "unknown"
        facts = record.get("facts") or {}
        record_id = record.get("id") or f"{record.get('topic_id', 'workspace')}:{source_url}:{entity}"
        topic_id = record.get("topic_id") or record.get("workspace_id") or "unknown"
        tenant_id = record.get("tenant_id") or "tenant_internal"
        with self._session() as session:
            session.execute_write(
                self._upsert_tx,
                entity,
                source_url,
                facts,
                {**record, "id": record_id, "topic_id": topic_id, "tenant_id": tenant_id},
            )

    def topic_graph(self, topic_id: str, limit: int = 80, tenant_id: str | None = None) -> GraphSnapshot:
        if self.health() != "ok":
            return GraphSnapshot(status=self.health(), message=self.message)
        try:
            with self._session() as session:
                return session.execute_read(self._topic_graph_tx, topic_id, limit, tenant_id)
        except Exception as exc:
            logger.warning("neo4j_topic_graph_failed", error=str(exc)[:300], topic_id=topic_id)
            return GraphSnapshot(status="error", message=str(exc))

    def entity_neighborhood(self, entity: str, limit: int = 60, tenant_id: str | None = None) -> GraphSnapshot:
        if self.health() != "ok":
            return GraphSnapshot(status=self.health(), message=self.message)
        try:
            with self._session() as session:
                return session.execute_read(self._entity_graph_tx, entity, limit, tenant_id)
        except Exception as exc:
            logger.warning("neo4j_entity_graph_failed", error=str(exc)[:300], entity=entity)
            return GraphSnapshot(status="error", message=str(exc))

    def _session(self):
        if self.settings.neo4j_database:
            return self.driver.session(database=self.settings.neo4j_database)
        return self.driver.session()

    @staticmethod
    def _upsert_tx(tx, entity: str, source_url: str, facts: dict[str, Any], record: dict[str, Any]) -> None:
        tx.run(
            """
            MERGE (w:Workspace {id: $topic_id})
            SET w.name = $topic_id,
                w.tenant_id = $tenant_id
            MERGE (c:Company {scoped_id: $company_scoped_id})
            SET c.name = $entity,
                c.tenant_id = $tenant_id,
                c.entity_type = coalesce($entity_type, c.entity_type, 'company'),
                c.last_seen = $last_checked
            MERGE (r:IntelligenceRecord {id: $record_id})
            SET r.summary = $summary,
                r.tenant_id = $tenant_id,
                r.topic_id = $topic_id,
                r.entity_name = $entity,
                r.confidence = $confidence,
                r.freshness_status = $freshness_status,
                r.last_checked = $last_checked,
                r.source_type = $source_type
            MERGE (s:Source {scoped_id: $source_scoped_id})
            SET s.url = $source_url,
                s.tenant_id = $tenant_id,
                s.source_type = $source_type,
                s.last_checked = $last_checked
            MERGE (w)-[:MONITORS]->(c)
            MERGE (w)-[:HAS_EVIDENCE]->(r)
            MERGE (c)-[:HAS_RECORD]->(r)
            MERGE (r)-[:SUPPORTED_BY]->(s)
            MERGE (c)-[:SUPPORTED_BY]->(s)
            """,
            tenant_id=record.get("tenant_id"),
            topic_id=record.get("topic_id"),
            entity=entity,
            company_scoped_id=f"{record.get('tenant_id')}:{entity}",
            entity_type=record.get("entity_type"),
            record_id=record.get("id"),
            summary=record.get("summary"),
            confidence=record.get("confidence", 0.0),
            freshness_status=record.get("freshness_status", "unknown"),
            source_url=source_url,
            source_scoped_id=f"{record.get('tenant_id')}:{source_url}",
            source_type=record.get("source_type", "unknown"),
            last_checked=str(record.get("last_checked")),
        )
        product = facts.get("product") or facts.get("platform") or facts.get("company")
        if product:
            tx.run(
                """
                MATCH (c:Company {scoped_id: $company_scoped_id})
                MERGE (p:Product {scoped_id: $product_scoped_id})
                SET p.name = $product,
                    p.tenant_id = $tenant_id
                MERGE (c)-[:OFFERS]->(p)
                """,
                tenant_id=record.get("tenant_id"),
                company_scoped_id=f"{record.get('tenant_id')}:{entity}",
                product=str(product),
                product_scoped_id=f"{record.get('tenant_id')}:{product}",
            )
        for feature in facts.get("features", []) or []:
            tx.run(
                """
                MATCH (c:Company {scoped_id: $company_scoped_id})
                MERGE (f:Feature {scoped_id: $feature_scoped_id})
                SET f.name = $feature,
                    f.tenant_id = $tenant_id
                MERGE (c)-[:HAS_FEATURE]->(f)
                """,
                tenant_id=record.get("tenant_id"),
                company_scoped_id=f"{record.get('tenant_id')}:{entity}",
                feature=str(feature),
                feature_scoped_id=f"{record.get('tenant_id')}:{feature}",
            )
        pricing = facts.get("pricing_model")
        if pricing:
            tx.run(
                """
                MATCH (c:Company {scoped_id: $company_scoped_id})
                MERGE (pm:PricingModel {scoped_id: $pricing_scoped_id})
                SET pm.name = $pricing,
                    pm.tenant_id = $tenant_id
                MERGE (c)-[:HAS_PRICING_MODEL]->(pm)
                """,
                tenant_id=record.get("tenant_id"),
                company_scoped_id=f"{record.get('tenant_id')}:{entity}",
                pricing=str(pricing),
                pricing_scoped_id=f"{record.get('tenant_id')}:{pricing}",
            )

    @staticmethod
    def _counts_tx(tx, tenant_id: str | None = None) -> dict[str, int]:
        rows = tx.run(
            """
            MATCH (n)
            WHERE $tenant_id IS NULL OR n.tenant_id = $tenant_id
            WITH labels(n)[0] AS label, count(n) AS count
            WITH collect({label: label, count: count}) AS labels
            OPTIONAL MATCH ()-[r]->()
            WHERE $tenant_id IS NULL OR (r.tenant_id = $tenant_id OR (startNode(r).tenant_id = $tenant_id AND endNode(r).tenant_id = $tenant_id))
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
            MATCH (c:Company)
            WHERE $tenant_id IS NULL OR c.tenant_id = $tenant_id
            OPTIONAL MATCH (c)-[r]-()
            WHERE $tenant_id IS NULL OR (r.tenant_id = $tenant_id OR (startNode(r).tenant_id = $tenant_id AND endNode(r).tenant_id = $tenant_id))
            RETURN c.name AS name, count(r) AS degree
            ORDER BY degree DESC, name ASC
            LIMIT 10
            """,
            tenant_id=tenant_id,
        )
        return [{"name": row["name"], "degree": row["degree"]} for row in rows]

    @classmethod
    def _topic_graph_tx(cls, tx, topic_id: str, limit: int, tenant_id: str | None) -> GraphSnapshot:
        rows = tx.run(
            """
            MATCH (w:Workspace {id: $topic_id})
            WHERE $tenant_id IS NULL OR w.tenant_id = $tenant_id
            MATCH (w)-[r1:MONITORS|HAS_EVIDENCE]->(n)
            WHERE $tenant_id IS NULL OR n.tenant_id = $tenant_id
            OPTIONAL MATCH (n)-[r2:HAS_RECORD|SUPPORTED_BY|OFFERS|HAS_FEATURE|HAS_PRICING_MODEL]->(m)
            WHERE m IS NULL OR $tenant_id IS NULL OR m.tenant_id = $tenant_id
            RETURN w, r1, n, r2, m
            LIMIT $limit
            """,
            topic_id=topic_id,
            tenant_id=tenant_id,
            limit=limit,
        )
        return cls._snapshot_from_rows(rows, "ok")

    @classmethod
    def _entity_graph_tx(cls, tx, entity: str, limit: int, tenant_id: str | None) -> GraphSnapshot:
        rows = tx.run(
            """
            MATCH (c:Company {name: $entity})
            WHERE $tenant_id IS NULL OR c.tenant_id = $tenant_id
            OPTIONAL MATCH (c)-[r1:HAS_RECORD|SUPPORTED_BY|OFFERS|HAS_FEATURE|HAS_PRICING_MODEL|MONITORS]-(n)
            WHERE n IS NULL OR $tenant_id IS NULL OR n.tenant_id = $tenant_id
            OPTIONAL MATCH (n)-[r2:SUPPORTED_BY|HAS_RECORD]-(m)
            WHERE m IS NULL OR $tenant_id IS NULL OR m.tenant_id = $tenant_id
            RETURN c, r1, n, r2, m
            LIMIT $limit
            """,
            entity=entity,
            tenant_id=tenant_id,
            limit=limit,
        )
        return cls._snapshot_from_rows(rows, "ok")

    @staticmethod
    def _snapshot_from_rows(rows, status: str) -> GraphSnapshot:
        nodes: dict[str, GraphNode] = {}
        relationships: dict[tuple[str, str, str], GraphRelationship] = {}

        def add_node(node) -> str | None:
            if node is None:
                return None
            labels = list(node.labels)
            node_type = labels[0] if labels else "Node"
            props = dict(node)
            label = props.get("name") or props.get("url") or props.get("id") or str(node.id)
            node_id = f"{node_type}:{label}"
            nodes[node_id] = GraphNode(id=node_id, label=str(label), type=node_type, properties=props)
            return node_id

        def add_rel(rel, start_id: str | None = None, end_id: str | None = None) -> None:
            if rel is None:
                return
            source = start_id or add_node(rel.start_node)
            target = end_id or add_node(rel.end_node)
            if not source or not target:
                return
            key = (source, target, rel.type)
            relationships[key] = GraphRelationship(source=source, target=target, type=rel.type, properties=dict(rel))

        for row in rows:
            values = dict(row)
            for value in values.values():
                if hasattr(value, "labels"):
                    add_node(value)
            add_rel(values.get("r1"))
            add_rel(values.get("r2"))

        counts = {
            "nodes": len(nodes),
            "relationships": len(relationships),
        }
        return GraphSnapshot(status=status, nodes=list(nodes.values()), relationships=list(relationships.values()), counts=counts)
