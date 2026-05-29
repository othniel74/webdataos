from types import SimpleNamespace

from packages.agents.orchestrator import ResearchAgentOrchestrator
from packages.schemas.agent import ResearchRunReceipt
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


def test_decision_brief_turns_run_output_into_user_value():
    agent = ResearchAgentOrchestrator()
    topic = SimpleNamespace(name="Vendor Risk", entities=["Okta", "Stripe"], watch_types=["vendor_risk"])
    record = SimpleNamespace(
        id="rec_1",
        entity_name="Okta",
        source_url="https://example.com/okta-risk",
        summary="Okta updated its trust center and incident posture.",
        confidence=0.82,
        freshness_status="fresh",
        facts={"evidence_title": "Okta trust update"},
    )
    reasoning = ReasoningOutput(
        materiality_assessments=[
            MaterialityAssessment(
                finding="Vendor posture changed",
                materiality="medium",
                impact_description="Security should review Okta controls.",
                evidence_ids=["rec_1"],
            )
        ],
        recommendations=[
            Recommendation(
                id="rec",
                title="Review Okta controls",
                description="Security should confirm whether the control change affects internal access policy.",
                reasoning="The fresh evidence is relevant to vendor exposure.",
                materiality="medium",
                evidence_chain=["rec_1"],
                affected_entities=["Okta"],
                suggested_actions=["Assign vendor owner to review the Okta change."],
            )
        ],
    )
    receipt = ResearchRunReceipt(
        run_id="run_1",
        topic_id="topic_1",
        tenant_id="tenant_1",
        package_id="security",
        task="Check vendor risk",
        status="success",
        input_mode="text",
        stages=[],
        providers={"retrieval": "brightdata", "llm": "openai"},
        counts={"records_used": 1, "recommendations": 1, "autonomous_actions": 0, "workflow_events": 0},
    )

    brief = agent._decision_brief(
        topic=topic,
        package_id="security",
        summary="Okta has a fresh vendor-risk signal that needs review.",
        records=[record],
        db_changes=[],
        reasoning_output=reasoning,
        action_proposals=[],
        confidence=0.82,
        receipt=receipt,
        previous_run_exists=False,
    )

    assert brief.headline == "Baseline created for Okta, Stripe"
    assert brief.business_impact.startswith("Security should confirm")
    assert brief.recommended_action == "Assign vendor owner to review the Okta change."
    assert brief.evidence[0].source_url == "https://example.com/okta-risk"
    assert brief.evidence[0].source_title == "Okta trust update"
    assert "1 records" in brief.receipt_summary
