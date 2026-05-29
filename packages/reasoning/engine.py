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
            signal_text = self._signal_text(rec)
            signal_type = self._classify_signal(signal_text)

            # Assess materiality based on org context
            materiality = "informational"
            impact_desc = f"Evidence collected for {rec.entity_name}."
            financial_impact = None
            urgency = "standard"
            affected_contracts = [rec.entity_name] if rec.entity_name else []

            if signal_type in {"breach", "security_risk", "compliance"}:
                materiality = "high" if signal_type == "breach" else "medium"
                urgency = "urgent" if signal_type == "breach" else "standard"
                impact_desc = (
                    f"{signal_type.replace('_', ' ').title()} signal detected for {rec.entity_name}. "
                    "Review security, compliance, and vendor-risk posture before the next decision cycle."
                )
                reasoning_trace.append(f"signal_classification: {rec.entity_name} classified as {signal_type}")
            elif signal_type in {"competitor_move", "account_intent"}:
                materiality = "medium"
                urgency = "standard"
                impact_desc = (
                    f"GTM signal detected for {rec.entity_name}. "
                    "Review positioning, affected accounts, competitive response, and sales enablement impact."
                )
                reasoning_trace.append(f"signal_classification: {rec.entity_name} classified as {signal_type}")
            elif signal_type in {"filing", "supplier_risk", "market_movement"}:
                materiality = "medium"
                urgency = "urgent" if signal_type == "filing" else "standard"
                impact_desc = (
                    f"Finance or procurement signal detected for {rec.entity_name}. "
                    "Review supplier exposure, budget impact, filings, renewal timing, and forecast implications."
                )
                reasoning_trace.append(f"signal_classification: {rec.entity_name} classified as {signal_type}")
            elif signal_type == "pricing":
                materiality = "medium"
                if framework.domain == "gtm":
                    impact_desc = (
                        f"Competitive pricing signal detected for {rec.entity_name}. "
                        "Review win-rate exposure, packaging response, battlecards, and customer messaging."
                    )
                elif framework.domain == "finance":
                    impact_desc = (
                        f"Supplier or market pricing signal detected for {rec.entity_name}. "
                        "Review spend exposure, renewal terms, savings opportunity, and budget impact."
                    )
                else:
                    impact_desc = (
                        f"Pricing or commercial-change signal detected for {rec.entity_name}. "
                        "Review commercial exposure, renewal terms, and budget impact."
                    )
                reasoning_trace.append(f"signal_classification: {rec.entity_name} classified as pricing")
            elif signal_type == "model_release":
                materiality = "low"
                if framework.domain == "gtm":
                    materiality = "medium"
                    impact_desc = (
                        f"Competitor product-release signal detected for {rec.entity_name}. "
                        "Review feature parity, positioning, customer objections, and sales enablement updates."
                    )
                else:
                    impact_desc = (
                        f"Product or model-release signal detected for {rec.entity_name}. "
                        "Track whether this changes capability, adoption, or competitive positioning."
                    )
                reasoning_trace.append(f"signal_classification: {rec.entity_name} classified as model_release")

            # Check for pricing changes against contract
            if facts.get("pricing_model") and contract:
                contract_value = contract.get("annual_value", 0)
                if contract_value > 0:
                    materiality = "high" if contract_value > 50000 else "medium"
                    financial_impact = round(contract_value * 0.02, 2)  # estimated 2% impact
                    total_impact += financial_impact or 0
                    impact_desc = f"Pricing signal detected for {rec.entity_name}. Contract value: ${contract_value:,.0f}. Estimated impact: ${financial_impact:,.0f}."
                    affected_contracts = [contract.get("entity_name", rec.entity_name or entity)]
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
        seen_recommendations: set[tuple[str, str]] = set()
        recommendation_inputs = []
        for assessment in material:
            entity_names = assessment.affected_contracts or ["Unknown"]
            key = (entity_names[0], assessment.materiality)
            if key in seen_recommendations:
                continue
            seen_recommendations.add(key)
            recommendation_inputs.append(assessment)

        for i, assessment in enumerate(recommendation_inputs[:5]):
            rec_id = f"rec_{uuid.uuid4().hex[:8]}"
            entity_names = assessment.affected_contracts or ["Unknown"]

            if assessment.financial_impact and assessment.financial_impact > 0:
                title = f"Review {entity_names[0]} contract — ${assessment.financial_impact:,.0f} potential impact"
                description = f"A pricing or risk signal was detected for {entity_names[0]}. " \
                              f"Given the contract value and renewal timeline, a procurement review is recommended."
                suggested = ["Initiate renegotiation", "Request updated terms", "Evaluate alternatives"]
            else:
                title = f"Review {entity_names[0]} - {assessment.materiality} materiality signal"
                description = assessment.impact_description
                suggested = self._suggest_actions(assessment.impact_description, framework.domain)

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
        medium_count = len([a for a in assessments if a.materiality == "medium"])
        risk_posture = (
            "critical" if critical_count > 0
            else "degrading" if high_count > 1
            else "monitoring" if high_count or medium_count
            else "stable"
        )

        if recommendations:
            confidence = round(sum(r.confidence for r in recommendations) / len(recommendations), 3)
        elif assessments:
            confidence = round(sum((rec.confidence or 0.65) for rec in records) / len(records), 3)
        else:
            confidence = 0.0

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
            confidence=confidence,
            reasoning_trace=reasoning_trace,
        )

    def _signal_text(self, rec: IntelligenceRecordRead) -> str:
        facts = rec.facts or {}
        values = [
            rec.entity_name or "",
            rec.source_url or "",
            rec.summary or "",
            str(facts.get("evidence_title") or ""),
            str(facts.get("snippet") or ""),
            str(facts.get("pricing_model") or ""),
            str(facts.get("positioning") or ""),
        ]
        return " ".join(values).lower()

    def _classify_signal(self, text: str) -> str:
        if any(term in text for term in ["breach", "incident", "vulnerability", "exploit", "leak", "ransomware"]):
            return "breach"
        if any(term in text for term in ["supplier", "supply chain", "procurement", "vendor spend", "supplier risk"]):
            return "supplier_risk"
        if any(term in text for term in ["security", "threat", "vendor risk", "soc2", "soc 2", "trust", "governance"]):
            return "security_risk"
        if any(term in text for term in ["compliance", "regulation", "regulatory", "audit", "gdpr", "eu ai act", "policy"]):
            return "compliance"
        if any(term in text for term in ["competitor", "competitive", "positioning", "messaging", "battlecard", "win rate", "launches"]):
            return "competitor_move"
        if any(term in text for term in ["intent", "rfp", "pipeline", "account", "buying signal", "hiring"]):
            return "account_intent"
        if any(term in text for term in ["filing", "10-k", "10q", "10-q", "annual report", "disclosure", "sec "]):
            return "filing"
        if any(term in text for term in ["market movement", "market signal", "sector", "commodity", "forecast", "inflation"]):
            return "market_movement"
        if any(term in text for term in ["pricing", "price", "cost", "plan", "subscription", "renewal"]):
            return "pricing"
        if any(term in text for term in ["launch", "release", "model", "integration", "enterprise", "feature"]):
            return "model_release"
        return "informational"

    def _suggest_actions(self, impact_description: str, domain: str = "enterprise") -> list[str]:
        text = impact_description.lower()
        if domain == "gtm":
            return [
                "Update competitive battlecards and sales talking points",
                "Brief sales and product marketing owners",
                "Assess account or pipeline exposure",
            ]
        if domain == "finance":
            return [
                "Open a procurement or finance review",
                "Estimate budget, renewal, or supplier exposure",
                "Compare alternatives and update forecast assumptions",
            ]
        if domain == "security":
            return [
                "Open a vendor-risk review",
                "Request updated security or compliance evidence",
                "Notify security and procurement owners",
            ]
        if "breach" in text or "security" in text or "risk" in text:
            return [
                "Open a vendor-risk review",
                "Request updated security documentation",
                "Notify security and procurement owners",
            ]
        if "compliance" in text or "regulatory" in text:
            return [
                "Map the signal to current compliance obligations",
                "Request updated compliance evidence",
                "Create a follow-up item for the compliance owner",
            ]
        if "pricing" in text or "commercial" in text:
            return [
                "Review budget and renewal exposure",
                "Ask procurement to confirm commercial impact",
                "Compare alternative vendors or plans",
            ]
        return ["Add to monitoring queue", "Review at next analyst checkpoint"]

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
        seen_actions: set[tuple[str, str]] = set()
        for rec in reasoning.recommendations:
            framework_id = rec.framework_used or ""
            entity = rec.affected_entities[0] if rec.affected_entities else "entity"
            if "competitive" in framework_id:
                action_key = ("update_competitive_brief", entity)
                if action_key not in seen_actions:
                    seen_actions.add(action_key)
                    proposals.append(ActionProposal(
                        action_type="update_competitive_brief",
                        title=f"Update competitive brief: {entity}",
                        description="Translate this GTM signal into battlecard, messaging, and account-response updates.",
                        payload={"recommendation_id": rec.id, "entities": rec.affected_entities},
                        recommendation_id=rec.id,
                        requires_approval=rec.materiality in {"critical", "high"},
                        urgency="standard",
                    ))
                continue
            if "procurement" in framework_id:
                action_key = ("schedule_procurement_review", entity)
                if action_key not in seen_actions:
                    seen_actions.add(action_key)
                    proposals.append(ActionProposal(
                        action_type="schedule_procurement_review",
                        title=f"Review finance exposure: {entity}",
                        description="Assess supplier, spend, renewal, filing, or market exposure tied to this signal.",
                        payload={"recommendation_id": rec.id, "entities": rec.affected_entities, "financial_impact": rec.financial_impact},
                        recommendation_id=rec.id,
                        requires_approval=rec.materiality in {"critical", "high"},
                        urgency="urgent" if rec.materiality in {"critical", "high"} else "standard",
                    ))
                continue
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
                action_key = ("update_risk_register", entity)
                if action_key in seen_actions:
                    continue
                seen_actions.add(action_key)
                proposals.append(ActionProposal(
                    action_type="update_risk_register",
                    title=f"Update risk register: {entity}",
                    description=f"Add finding to risk register for next review cycle.",
                    payload={"recommendation_id": rec.id, "entities": rec.affected_entities},
                    recommendation_id=rec.id,
                    requires_approval=False,
                    urgency="low",
                ))

        return proposals
