from packages.graph.neo4j_client import Neo4jGraphClient


class FakeTx:
    def __init__(self) -> None:
        self.queries = []

    def run(self, query, **params):
        self.queries.append((query, params))
        return []


def test_neo4j_disabled_status(monkeypatch):
    monkeypatch.setenv("NEO4J_ENABLED", "false")
    from packages.common.config import get_settings

    get_settings.cache_clear()
    client = Neo4jGraphClient()

    assert client.health() == "disabled"
    assert client.status().status == "disabled"
    assert client.topic_graph("workspace").status == "disabled"
    get_settings.cache_clear()


def test_upsert_tx_projects_enterprise_graph():
    tx = FakeTx()

    Neo4jGraphClient._upsert_tx(
        tx,
        "OpenAI",
        "https://example.com/openai",
        {"company": "OpenAI", "product": "ChatGPT Enterprise", "features": ["admin controls"], "pricing_model": "usage"},
        {
            "id": "rec_1",
            "topic_id": "ws_enterprise",
            "entity_type": "company",
            "summary": "OpenAI enterprise signal",
            "confidence": 0.88,
            "freshness_status": "fresh",
            "source_type": "company_page",
            "last_checked": "2026-06-01T09:00:00Z",
        },
    )

    joined = "\n".join(query for query, _ in tx.queries)
    assert "MERGE (w:Workspace" in joined
    assert "MERGE (r:IntelligenceRecord" in joined
    assert "MERGE (w)-[:MONITORS]->(c)" in joined
    assert "MERGE (c)-[:HAS_RECORD]->(r)" in joined
    assert "MERGE (c)-[:OFFERS]->(p)" in joined
    assert "MERGE (c)-[:HAS_FEATURE]->(f)" in joined
    assert "MERGE (c)-[:HAS_PRICING_MODEL]->(pm)" in joined
