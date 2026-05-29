import pytest

from packages.reasoning.engine import ReasoningEngine
from packages.schemas.intelligence import IntelligenceRecordRead


def record(summary: str, facts: dict | None = None) -> IntelligenceRecordRead:
    return IntelligenceRecordRead(
        id=summary[:12].replace(" ", "_"),
        topic_id="workspace_test",
        entity_name="ExampleCo",
        source_url="https://example.com/source",
        source_type="company_page",
        summary=summary,
        facts=facts or {},
        confidence=0.82,
        freshness_status="fresh",
    )


@pytest.mark.asyncio
async def test_gtm_reasoning_creates_competitive_actions():
    engine = ReasoningEngine()
    output = await engine.reason(
        "gtm",
        [record("Competitor changed enterprise pricing and messaging for target accounts.")],
        org_context=None,
    )
    actions = engine.propose_actions(output, "workspace_test")

    assert output.recommendations
    assert output.recommendations[0].framework_used == "competitive_response"
    assert any("battlecards" in " ".join(rec.suggested_actions).lower() for rec in output.recommendations)
    assert actions[0].action_type == "update_competitive_brief"


@pytest.mark.asyncio
async def test_finance_reasoning_creates_procurement_actions():
    engine = ReasoningEngine()
    output = await engine.reason(
        "finance",
        [record("Supplier risk and market movement signal affecting procurement forecast.")],
        org_context=None,
    )
    actions = engine.propose_actions(output, "workspace_test")

    assert output.recommendations
    assert output.recommendations[0].framework_used == "procurement_decision"
    assert any("procurement" in " ".join(rec.suggested_actions).lower() for rec in output.recommendations)
    assert actions[0].action_type == "schedule_procurement_review"


@pytest.mark.asyncio
async def test_security_reasoning_keeps_vendor_risk_actions():
    engine = ReasoningEngine()
    output = await engine.reason(
        "security",
        [record("Vendor trust page changed with SOC2 and compliance risk updates.")],
        org_context=None,
    )
    actions = engine.propose_actions(output, "workspace_test")

    assert output.recommendations
    assert output.recommendations[0].framework_used == "security_risk_assessment"
    assert any("vendor-risk" in " ".join(rec.suggested_actions).lower() for rec in output.recommendations)
    assert actions[0].action_type == "update_risk_register"
