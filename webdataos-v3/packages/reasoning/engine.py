"""LLM-backed reasoning engine that evaluates evidence against organizational context.

In mock mode, produces deterministic reasoning output.
In production mode, calls an LLM (Claude/GPT) with the framework prompt.
"""
from __future__ import annotations

import uuid
from packages.reasoning.frameworks import ReasoningFramework, get_framework
from packages.schemas.intelligence import IntelligenceRecordRead
from packages.schemas.partners import MemoryRecord
from packages.schemas.reasoning import (
    ActionProposal,
    MaterialityAssessment,
    OrgContextRead,
    Recommendation,
    ReasoningOutput,
)


class ReasoningEngine:
    """Evaluates evidence records against organizational context using
    package-specific reasoning frameworks. Produces materiality assessments,
    recommendations, and autonomous action proposals."""

    def __init__(self, llm_client=None) -> None:
        self.llm = llm_client  # None = mock mode

    async def reason(
        self,
        package_id: str,
        records: list[IntelligenceRecordRead],
        org_context: OrgContextRead | None,
        memories: list[MemoryRecord] | None = None,
        changes: list[dict] | None = None,
    ) -> ReasoningOutput:
        framework = get_framework(package_id)

        if self.llm:
            return await self._llm_reason(framework, records, org_context, memories, changes)

        return self._mock_reason(framework, records, org_context, memories, changes)

    def _mock_reason(
        self,
        framework: ReasoningFramework,
        records: list[IntelligenceRecordRead],
        org_context: OrgContextRead | None,
        memories: list[MemoryRecord] | None,
        changes: list[dict] | None,
    ) -> ReasoningOutput:
        """Deterministic mock reasoning that demonstrates the full output shape."""

        contracts_by_entity = {}
        thresholds = None
        exposure = None
        if org_context:
            for c in org_context.contracts:
                contracts_by_entity[c.get("entity_name", "").lower()] = c
            thresholds = org_context.risk_thresholds
            exposure = org_context.financial_exposure

        assessments = []
        recommendations = []
        reasoning_trace = []
        total_impact = 0.0

        for rec in records:
            entity = (rec.entity_name or "Unknown").lower()
            contract = contracts_by_entity.get(entity, {})
            facts = rec.facts or {}

            # Assess materiality based on org context
            materiality = "informational"
            impact_desc = f"Evidence collected for {rec.entity_name}."
            financial_impact = None
            urgency = "standard"
            affected_contracts = []

            # Check for pricing changes against contract
            if facts.get("pricing_model") and contract:
                contract_value = contract.get("annual_value", 0)
                if contract_value > 0:
                    materiality = "high" if contract_value > 50000 else "medium"
                    financial_impact = round(contract_value * 0.02, 2)  # estimated 2% impact
                    total_impact += financial_impact or 0
                    impact_desc = f"Pricing signal detected for {rec.entity_name}. Contract value: ${contract_value:,.0f}. Estimated impact: ${financial_impact:,.0f}."
                    affected_contracts.append(contract.get("entity_name", entity))
                    reasoning_trace.append(f"pricing_check: {rec.entity_name} pricing_model={facts.get('pricing_model')} vs contract_value={contract_value}")

            # Check renewal proximity
            if contract and contract.get("renewal_date"):
                urgency = "urgent"
                materiality = "high" if materiality in {"medium", "informational"} else materiality
                impact_desc += f" Renewal date: {contract.get('renewal_date')}."
                reasoning_trace.append(f"renewal_check: {rec.entity_name} renews {contract.get('renewal_date')}")

            # Check freshness threshold
            if rec.freshness_status == "stale":
                reasoning_trace.append(f"freshness_flag: {rec.entity_name} is stale — data may not reflect current state")

            # Check risk tier
            if contract and contract.get("risk_tier") in {"high", "critical"}:
                if materiality == "informational":
                    materiality = "medium"
                reasoning_trace.append(f"risk_tier_elevation: {rec.entity_name} is {contract.get('risk_tier')} tier")

            assessments.append(MaterialityAssessment(
                finding=rec.summary or f"Evidence for {rec.entity_name}",
                materiality=materiality,
                impact_description=impact_desc,
                financial_impact=financial_impact,
                affected_contracts=affected_contracts,
                urgency=urgency,
                evidence_ids=[rec.id],
            ))

        # Generate recommendations from material findings
        material = [a for a in assessments if a.materiality in {"critical", "high", "medium"}]
        for i, assessment in enumerate(material[:5]):
            rec_id = f"rec_{uuid.uuid4().hex[:8]}"
            entity_names = assessment.affected_contracts or ["Unknown"]

            if assessment.financial_impact and assessment.financial_impact > 0:
                title = f"Review {entity_names[0]} contract — ${assessment.financial_impact:,.0f} potential impact"
                description = f"A pricing or risk signal was detected for {entity_names[0]}. " \
                              f"Given the contract value and renewal timeline, a procurement review is recommended."
                suggested = ["Initiate renegotiation", "Request updated terms", "Evaluate alternatives"]
            else:
                title = f"Monitor {entity_names[0]} — {assessment.materiality} materiality signal"
                description = assessment.impact_description
                suggested = ["Add to next review cycle", "Request updated documentation"]

            recommendations.append(Recommendation(
                id=rec_id,
                title=title,
                description=description,
                reasoning=f"Assessment based on {framework.name} framework. {assessment.impact_description}",
                materiality=assessment.materiality,
                confidence=0.82 + (i * 0.02),
                evidence_chain=assessment.evidence_ids,
                suggested_actions=suggested,
                affected_entities=entity_names,
                financial_impact=assessment.financial_impact,
                deadline=None,
                framework_used=framework.id,
            ))

        # Risk posture
        critical_count = len([a for a in assessments if a.materiality == "critical"])
        high_count = len([a for a in assessments if a.materiality == "high"])
        risk_posture = "critical" if critical_count > 0 else "degrading" if high_count > 2 else "stable" if high_count <= 1 else "monitoring"

        exec_summary = (
            f"Analyzed {len(records)} evidence records against organizational context using {framework.name}. "
            f"Found {len(material)} material signals requiring attention. "
            f"Total estimated financial impact: ${total_impact:,.0f}. "
            f"Risk posture: {risk_posture}."
        )

        return ReasoningOutput(
            materiality_assessments=assessments,
            recommendations=recommendations,
            executive_summary=exec_summary,
            risk_posture=risk_posture,
            confidence=round(sum(r.confidence for r in recommendations) / max(len(recommendations), 1), 3),
            reasoning_trace=reasoning_trace,
        )

    async def _llm_reason(self, framework, records, org_context, memories, changes):
        """Production LLM reasoning — placeholder for real API call."""
        # In production, this would:
        # 1. Format the framework prompt with org_context, evidence, memory
        # 2. Call Claude/GPT API
        # 3. Parse structured JSON response
        # 4. Return ReasoningOutput
        return self._mock_reason(framework, records, org_context, memories, changes)

    def propose_actions(
        self,
        reasoning: ReasoningOutput,
        workspace_id: str,
    ) -> list[ActionProposal]:
        """Generate autonomous action proposals from recommendations."""
        proposals = []
        for rec in reasoning.recommendations:
            if rec.materiality in {"critical", "high"}:
                # High materiality → propose concrete actions
                if rec.financial_impact and rec.financial_impact > 0:
                    proposals.append(ActionProposal(
                        action_type="schedule_review",
                        title=f"Schedule procurement review: {rec.affected_entities[0] if rec.affected_entities else 'entity'}",
                        description=f"Automated review triggered by {rec.materiality} materiality finding. {rec.description}",
                        payload={"recommendation_id": rec.id, "entities": rec.affected_entities, "financial_impact": rec.financial_impact},
                        recommendation_id=rec.id,
                        requires_approval=True,
                        urgency="urgent" if rec.materiality == "critical" else "standard",
                    ))
                    proposals.append(ActionProposal(
                        action_type="draft_email",
                        title=f"Draft renegotiation email for {rec.affected_entities[0] if rec.affected_entities else 'entity'}",
                        description=f"Draft email to vendor requesting updated terms based on detected pricing change.",
                        payload={"recommendation_id": rec.id, "template": "renegotiation", "entities": rec.affected_entities},
                        recommendation_id=rec.id,
                        requires_approval=True,
                        urgency="standard",
                    ))
                else:
                    proposals.append(ActionProposal(
                        action_type="notify_team",
                        title=f"Alert: {rec.title}",
                        description=rec.description,
                        payload={"recommendation_id": rec.id, "severity": rec.materiality},
                        recommendation_id=rec.id,
                        requires_approval=False,
                        urgency="standard",
                    ))

            elif rec.materiality == "medium":
                proposals.append(ActionProposal(
                    action_type="update_risk_register",
                    title=f"Update risk register: {rec.affected_entities[0] if rec.affected_entities else 'entity'}",
                    description=f"Add finding to risk register for next review cycle.",
                    payload={"recommendation_id": rec.id, "entities": rec.affected_entities},
                    recommendation_id=rec.id,
                    requires_approval=False,
                    urgency="low",
                ))

        return proposals
