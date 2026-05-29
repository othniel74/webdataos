import hashlib
from datetime import timedelta
from packages.common.time import utc_now


def stable_id(*parts: str) -> str:
    return hashlib.sha256("|".join([p or "" for p in parts]).encode()).hexdigest()[:32]


def freshness_status(last_checked, required_days: int | None = None) -> str:
    if not last_checked:
        return "unknown"
    days = required_days or 7
    if utc_now() - last_checked <= timedelta(days=days):
        return "fresh"
    return "stale"


def infer_source_type(url: str) -> str:
    lower = url.lower()
    if "pricing" in lower:
        return "pricing_page"
    if "docs" in lower or "documentation" in lower:
        return "docs_page"
    if "news" in lower or "blog" in lower:
        return "news_page"
    if "linkedin" in lower:
        return "social_public"
    return "company_page"


def infer_authority(url: str) -> str:
    lower = url.lower()
    if "example.com" in lower:
        return "demo"
    if any(x in lower for x in [".gov", "sec.gov", "companieshouse"]):
        return "official_registry"
    if any(x in lower for x in ["pricing", "docs", "about", "product"]):
        return "official_or_primary"
    return "third_party"
