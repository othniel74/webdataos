"""
Gap 3: Source quality tiering — classify each evidence source by authority level.

Tier 1 = official sources (CVE databases, SEC filings, regulatory bodies, vendor trust pages)
Tier 2 = major news outlets (Reuters, FT, WSJ, TechCrunch, etc.)
Tier 3 = everything else (blogs, aggregators, unknown)

Tier-1 sources are boosted in retrieval ranking so primary evidence surfaces first.
"""
from __future__ import annotations

import re

TIER_1_PATTERNS = [
    r"sec\.gov",
    r"cve\.mitre\.org",
    r"nvd\.nist\.gov",
    r"cisa\.gov",
    r"eur-lex\.europa\.eu",
    r"federalregister\.gov",
    r"legislation\.gov\.uk",
    r"gov\.uk",
    r"fca\.org\.uk",
    r"ecb\.europa\.eu",
    r"bis\.org",
    r"trust\.(okta|salesforce|aws|google|cloudflare|microsoft)\.com",
    r"security\.microsoft\.com",
    r"aws\.amazon\.com/security",
    r"cloud\.google\.com/security",
    r"support\.okta\.com",
    r"developer\.salesforce\.com/security",
    r"investor\.",
    r"/press-release/",
    r"/newsroom/",
    r"/ir/",
    r"/investor-relations/",
    r"accesswire\.com",
    r"businesswire\.com",
    r"prnewswire\.com",
    r"globenewswire\.com",
    r"nist\.gov",
    r"owasp\.org",
    r"mitre\.org",
    r"dhs\.gov",
]

TIER_2_PATTERNS = [
    r"reuters\.com",
    r"ft\.com",
    r"wsj\.com",
    r"bloomberg\.com",
    r"techcrunch\.com",
    r"theverge\.com",
    r"wired\.com",
    r"arstechnica\.com",
    r"zdnet\.com",
    r"forbes\.com",
    r"cnbc\.com",
    r"bbc\.co\.uk",
    r"bbc\.com",
    r"theguardian\.com",
    r"nytimes\.com",
    r"washingtonpost\.com",
    r"venturebeat\.com",
    r"semafor\.com",
    r"axios\.com",
    r"politico\.com",
    r"theregister\.com",
    r"securityweek\.com",
    r"darkreading\.com",
    r"krebsonsecurity\.com",
    r"hackernews",
    r"news\.ycombinator\.com",
]

_TIER_1_RE = re.compile("|".join(TIER_1_PATTERNS), re.IGNORECASE)
_TIER_2_RE = re.compile("|".join(TIER_2_PATTERNS), re.IGNORECASE)

TIER_BOOST = {1: 1.4, 2: 1.15, 3: 1.0}
TIER_LABELS = {1: "official", 2: "news", 3: "web"}


def classify_source_tier(url: str | None) -> int:
    """Return 1 (official), 2 (major news), or 3 (other) for a given URL."""
    if not url:
        return 3
    if _TIER_1_RE.search(url):
        return 1
    if _TIER_2_RE.search(url):
        return 2
    return 3


def tier_label(tier: int) -> str:
    return TIER_LABELS.get(tier, "web")


def boost_score(score: float, tier: int) -> float:
    return score * TIER_BOOST.get(tier, 1.0)
