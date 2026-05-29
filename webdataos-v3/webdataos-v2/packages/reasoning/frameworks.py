"""Package-specific reasoning frameworks for the LLM-backed reasoning engine.

Each framework defines how the reasoning engine should evaluate findings,
assess materiality, and generate recommendations for a specific intelligence domain.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ReasoningFramework:
    id: str
    name: str
    domain: str
    evaluation_criteria: list[str]
    materiality_factors: list[str]
    recommendation_patterns: list[str]
    prompt_template: str


FRAMEWORKS: dict[str, ReasoningFramework] = {
    "security": ReasoningFramework(
        id="security_risk_assessment",
        name="Security & Compliance Risk Assessment",
        domain="security",
        evaluation_criteria=[
            "Has the vendor disclosed a breach or security incident?",
            "Has the vendor's compliance posture changed (SOC2, ISO, GDPR)?",
            "Are there new regulatory requirements affecting this vendor?",
            "Has the vendor's trust page or security documentation changed?",
            "Does the vendor handle PII or regulated data for this organization?",
        ],
        materiality_factors=[
            "Data sensitivity level of the vendor relationship",
            "Contract value and renewal timeline",
            "Number of users/systems dependent on this vendor",
            "Regulatory exposure if vendor fails compliance",
            "Availability of alternative vendors",
        ],
        recommendation_patterns=[
            "Escalate to security review board if breach detected",
            "Initiate vendor risk reassessment if compliance lapsed",
            "Schedule compliance review before renewal date",
            "Request updated SOC2/ISO documentation from vendor",
            "Evaluate alternative vendors if risk score exceeds threshold",
        ],
        prompt_template="""You are an enterprise security analyst evaluating vendor risk intelligence.

ORGANIZATIONAL CONTEXT:
{org_context}

EVIDENCE RECORDS:
{evidence}

PRIOR MEMORY:
{memory}

EVALUATION CRITERIA:
{criteria}

For each finding, assess:
1. MATERIALITY: Is this finding material to this organization given their contracts, risk thresholds, and compliance requirements?
2. IMPACT: What is the specific business impact (financial, operational, regulatory)?
3. URGENCY: Does this require immediate action, or is it a monitoring signal?
4. RECOMMENDATION: What specific action should the organization take, with evidence citations?

Produce your analysis as structured JSON with materiality_assessments and recommendations.""",
    ),

    "gtm": ReasoningFramework(
        id="competitive_response",
        name="GTM Competitive Response",
        domain="gtm",
        evaluation_criteria=[
            "Has a competitor changed their pricing model or price point?",
            "Has a competitor launched or announced a new product/feature?",
            "Has a competitor changed their positioning or messaging?",
            "Are there hiring signals indicating competitor strategic shifts?",
            "Are target accounts showing buying intent signals?",
        ],
        materiality_factors=[
            "Revenue overlap with the competitor",
            "Accounts at risk of switching",
            "Feature parity gap created by the change",
            "Pricing differential impact on win rates",
            "Strategic priority alignment",
        ],
        recommendation_patterns=[
            "Adjust pricing response if competitor undercuts by >5%",
            "Brief sales team on competitive positioning change",
            "Accelerate feature development if parity gap widens",
            "Target competitor's displaced customers",
            "Update battle cards and competitive collateral",
        ],
        prompt_template="""You are a GTM intelligence analyst evaluating competitive and market signals.

ORGANIZATIONAL CONTEXT:
{org_context}

EVIDENCE RECORDS:
{evidence}

PRIOR MEMORY:
{memory}

EVALUATION CRITERIA:
{criteria}

For each finding, assess:
1. MATERIALITY: Does this competitive signal require a strategic response?
2. IMPACT: How does this affect win rates, pipeline, and revenue?
3. URGENCY: Is this a fast-moving competitive threat or a slow trend?
4. RECOMMENDATION: What specific GTM action should be taken?

Produce your analysis as structured JSON with materiality_assessments and recommendations.""",
    ),

    "finance": ReasoningFramework(
        id="procurement_decision",
        name="Finance & Procurement Decision",
        domain="finance",
        evaluation_criteria=[
            "Has a supplier or vendor changed their pricing?",
            "Are there new filings or financial disclosures for monitored companies?",
            "Has a supplier's risk profile changed?",
            "Are there market movement signals affecting procurement costs?",
            "Are alternative suppliers emerging with better terms?",
        ],
        materiality_factors=[
            "Annual spend with the affected entity",
            "Contract renewal timeline",
            "Price change magnitude vs. negotiated rate",
            "Switching costs to alternative suppliers",
            "Budget impact of the change",
        ],
        recommendation_patterns=[
            "Initiate renegotiation if public pricing dropped below contract rate",
            "Lock in current rate before renewal if pricing is trending up",
            "Evaluate alternative supplier if risk score increased",
            "Schedule procurement review before contract expiry",
            "Update financial forecasts if market movement exceeds threshold",
        ],
        prompt_template="""You are a procurement intelligence analyst evaluating financial and supplier signals.

ORGANIZATIONAL CONTEXT:
{org_context}

EVIDENCE RECORDS:
{evidence}

PRIOR MEMORY:
{memory}

EVALUATION CRITERIA:
{criteria}

For each finding, assess:
1. MATERIALITY: Does this signal have a measurable financial impact on this organization?
2. IMPACT: Quantify the $ impact where possible (savings opportunity, cost increase, risk exposure).
3. URGENCY: Does this require action before a specific deadline (renewal, filing, budget cycle)?
4. RECOMMENDATION: What specific procurement or financial action should be taken?

Produce your analysis as structured JSON with materiality_assessments and recommendations.""",
    ),

    "enterprise": ReasoningFramework(
        id="executive_intelligence",
        name="Enterprise Intelligence OS — Cross-Domain Assessment",
        domain="enterprise",
        evaluation_criteria=[
            "Are there cross-domain signals (security + pricing, compliance + competitive)?",
            "Do multiple findings point to the same strategic risk or opportunity?",
            "Are there signals that affect multiple contracts or vendor relationships?",
            "Is there a regulatory change that affects both compliance and procurement?",
            "Are competitive moves creating security or supply chain risks?",
        ],
        materiality_factors=[
            "Cross-domain impact breadth (how many teams affected)",
            "Total financial exposure across all affected contracts",
            "Regulatory deadline proximity across domains",
            "Strategic priority alignment across business units",
            "Compound risk of correlated signals",
        ],
        recommendation_patterns=[
            "Convene cross-functional review if multi-domain signals detected",
            "Escalate to executive leadership if compound risk exceeds threshold",
            "Coordinate security review with procurement renegotiation",
            "Align competitive response with supplier diversification",
            "Produce executive brief connecting security, market, and financial signals",
        ],
        prompt_template="""You are a chief intelligence analyst producing an executive intelligence assessment across security, GTM, and finance domains.

ORGANIZATIONAL CONTEXT:
{org_context}

EVIDENCE RECORDS:
{evidence}

PRIOR MEMORY:
{memory}

EVALUATION CRITERIA:
{criteria}

CROSS-DOMAIN ANALYSIS:
Look for connections between security signals, competitive moves, and financial impacts.
A vendor's pricing change might create a procurement opportunity AND a competitive insight.
A regulatory deadline might affect both compliance posture AND contract terms.

For each finding, assess:
1. MATERIALITY: Rate materiality considering cross-domain impact.
2. IMPACT: Describe impact across all affected business functions.
3. URGENCY: Identify the most urgent deadline across all domains.
4. RECOMMENDATION: Provide coordinated cross-functional recommendations.

Produce your analysis as structured JSON with materiality_assessments and recommendations.""",
    ),
}


def get_framework(package_id: str) -> ReasoningFramework:
    return FRAMEWORKS.get(package_id, FRAMEWORKS["enterprise"])
