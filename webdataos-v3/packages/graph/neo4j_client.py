from typing import Any
from neo4j import GraphDatabase
from packages.common.config import get_settings


class Neo4jGraphClient:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.enabled = self.settings.neo4j_enabled
        self.driver = None
        if self.enabled:
            try:
                self.driver = GraphDatabase.driver(
                    self.settings.neo4j_uri,
                    auth=(self.settings.neo4j_user, self.settings.neo4j_password),
                )
            except Exception:
                self.enabled = False

    def close(self) -> None:
        if self.driver:
            self.driver.close()

    def upsert_intelligence_record(self, record: dict[str, Any]) -> None:
        if not self.enabled or not self.driver:
            return
        entity = record.get("entity_name") or record.get("facts", {}).get("company") or "Unknown"
        source_url = record.get("source_url")
        facts = record.get("facts") or {}
        with self.driver.session() as session:
            session.execute_write(self._upsert_tx, entity, source_url, facts, record)

    @staticmethod
    def _upsert_tx(tx, entity: str, source_url: str, facts: dict[str, Any], record: dict[str, Any]):
        tx.run(
            """
            MERGE (c:Company {name: $entity})
            MERGE (s:Source {url: $source_url})
            SET s.source_type = $source_type, s.last_checked = $last_checked
            MERGE (c)-[:SUPPORTED_BY]->(s)
            """,
            entity=entity,
            source_url=source_url,
            source_type=record.get("source_type", "unknown"),
            last_checked=str(record.get("last_checked")),
        )
        product = facts.get("product") or facts.get("platform") or facts.get("company")
        if product:
            tx.run(
                """
                MATCH (c:Company {name: $entity})
                MERGE (p:Product {name: $product})
                MERGE (c)-[:OFFERS]->(p)
                """,
                entity=entity,
                product=product,
            )
        for feature in facts.get("features", []) or []:
            tx.run(
                """
                MATCH (c:Company {name: $entity})
                MERGE (f:Feature {name: $feature})
                MERGE (c)-[:HAS_FEATURE]->(f)
                """,
                entity=entity,
                feature=str(feature),
            )
        pricing = facts.get("pricing_model")
        if pricing:
            tx.run(
                """
                MATCH (c:Company {name: $entity})
                MERGE (pm:PricingModel {name: $pricing})
                MERGE (c)-[:HAS_PRICING_MODEL]->(pm)
                """,
                entity=entity,
                pricing=str(pricing),
            )
