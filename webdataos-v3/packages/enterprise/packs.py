from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class IntelligencePack:
    id: str
    name: str
    tier: str
    description: str
    entities: list[str]
    signals: list[str]
    brightdata_routes: list[str]
    output_focus: list[str]
    input_channels: list[str] = field(default_factory=lambda: ["text", "voice", "audio_upload"])
    partner_routes: list[str] = field(default_factory=lambda: ["speechmatics", "cognee", "brightdata", "triggerware"])


COMMON_PARTNERS = ["speechmatics", "cognee", "brightdata", "triggerware"]
COMMON_INPUTS = ["text", "voice", "audio_upload"]

INTELLIGENCE_PACKS: dict[str, IntelligencePack] = {
    "security": IntelligencePack(
        id="security",
        name="Security & Compliance",
        tier="Focused pack",
        description="Monitor vendor risk, regulatory changes, breach exposure, policy updates, and public risk signals.",
        entities=["vendors", "regulators", "domains", "security_pages"],
        signals=["vendor_risk", "regulatory_change", "breach_exposure", "compliance_signal"],
        brightdata_routes=["serp_api", "web_unlocker", "scraping_browser", "web_scraper_api"],
        output_focus=["risk_brief", "evidence", "recommended_action", "workflow_action"],
        input_channels=COMMON_INPUTS,
        partner_routes=COMMON_PARTNERS,
    ),
    "gtm": IntelligencePack(
        id="gtm",
        name="GTM Intelligence",
        tier="Focused pack",
        description="Track competitors, pricing, messaging, hiring signals, account enrichment, and buying intent.",
        entities=["competitors", "accounts", "products", "markets"],
        signals=["competitor_move", "pricing_change", "messaging_shift", "buying_signal"],
        brightdata_routes=["serp_api", "web_scraper_api", "scraping_browser", "mcp_server"],
        output_focus=["market_brief", "account_intelligence", "competitive_change", "workflow_action"],
        input_channels=COMMON_INPUTS,
        partner_routes=COMMON_PARTNERS,
    ),
    "finance": IntelligencePack(
        id="finance",
        name="Finance & Market",
        tier="Focused pack",
        description="Monitor filings, supplier signals, pricing movements, sector changes, and alternative market data.",
        entities=["companies", "suppliers", "sectors", "market_pages"],
        signals=["filing", "supplier_signal", "market_movement", "alternative_data"],
        brightdata_routes=["serp_api", "web_scraper_api", "scraping_browser", "proxies"],
        output_focus=["market_signal", "company_brief", "supplier_risk", "workflow_action"],
        input_channels=COMMON_INPUTS,
        partner_routes=COMMON_PARTNERS,
    ),
    "enterprise": IntelligencePack(
        id="enterprise",
        name="Enterprise Intelligence OS",
        tier="Highest tier · Combo pack",
        description="Combine Security, GTM, Finance, voice input, Cognee evidence memory, Bright Data retrieval, TriggerWare automations, and agent-ready JSON.",
        entities=["vendors", "competitors", "accounts", "companies"],
        signals=["vendor_risk", "competitor_move", "pricing_change", "market_movement", "regulatory_change", "workflow_trigger"],
        brightdata_routes=["serp_api", "web_unlocker", "scraping_browser", "web_scraper_api", "mcp_server"],
        output_focus=["executive_brief", "cross_track_alert", "shared_evidence", "workflow_action"],
        input_channels=COMMON_INPUTS,
        partner_routes=COMMON_PARTNERS,
    ),
}


def get_pack(pack_id: str | None) -> IntelligencePack:
    if not pack_id:
        return INTELLIGENCE_PACKS["enterprise"]
    return INTELLIGENCE_PACKS.get(pack_id, INTELLIGENCE_PACKS["enterprise"])


def list_packs() -> list[IntelligencePack]:
    return list(INTELLIGENCE_PACKS.values())
