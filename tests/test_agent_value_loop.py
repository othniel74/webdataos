from types import SimpleNamespace

from packages.agents.orchestrator import ResearchAgentOrchestrator
from packages.schemas.reasoning import MaterialityAssessment, ReasoningOutput, Recommendation


def test_value_loop_marks_first_successful_run_as_baseline():
    agent = ResearchAgentOrchestrator()
    topic = SimpleNamespace(entities=["Okta", "Stripe"], watch_types=["vendor_risk", "pricing_change"])
    record = SimpleNamespace(id="rec_1", entity_name="Okta", source_url="https://example.com/okta")
    reasoning = ReasoningOutput(
        materiality_assessments=[
            MaterialityAssessment(
                finding="Vendor risk signal",
                materiality="medium",
                impact_description="Review vendor exposure.",
                evidence_ids=["rec_1"],
            )
        ],
        recommendations=[
            Recommendation(
                id="rec",
                title="Review Okta",
                description="Review vendor exposure.",
                reasoning="Evidence-backed signal.",
                materiality="medium",
                evidence_chain=["rec_1"],
                affected_entities=["Okta"],
            )
        ],
    )

    loop = agent._value_loop(
        topic=topic,
        records=[record],
        db_changes=[],
        reasoning_output=reasoning,
        action_proposals=[object()],
        workflow_events=[],
        outcome_count=0,
        previous_run_exists=False,
    )

    assert [step["step"] for step in loop] == ["Monitor", "Evidence", "Compare", "Reason", "Act", "Outcome"]
    assert loop[0]["status"] == "configured"
    assert loop[1]["status"] == "saved"
    assert loop[2]["status"] == "baseline"
    assert loop[3]["status"] == "complete"
    assert loop[4]["status"] == "ready"
    assert loop[5]["status"] == "pending"


def test_value_loop_reports_changes_after_baseline_exists():
    agent = ResearchAgentOrchestrator()
    topic = SimpleNamespace(entities=["OpenAI"], watch_types=["model_release"])
    record = SimpleNamespace(id="rec_1", entity_name="OpenAI", source_url="https://example.com/openai")

    loop = agent._value_loop(
        topic=topic,
        records=[record],
        db_changes=[{"field": "pricing_model"}],
        reasoning_output=None,
        action_proposals=[],
        workflow_events=[],
        outcome_count=1,
        previous_run_exists=True,
    )

    assert loop[2]["status"] == "changed"
    assert loop[3]["status"] == "blocked"
    assert loop[5]["status"] == "recorded"
