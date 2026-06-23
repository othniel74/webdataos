from __future__ import annotations

import httpx

from packages.common.config import get_settings
from packages.common.logging import get_logger

logger = get_logger(__name__)

_SEVERITY_EMOJI = {
    "critical": "🔴",
    "high": "🟠",
    "medium": "🟡",
    "low": "🟢",
    "stable": "🟢",
    "elevated": "🟠",
    "unknown": "⚪",
}

_TIER_LABEL = {1: "T1 official", 2: "T2 news", 3: "T3 web"}


class SlackService:
    """Posts decision brief alerts to a Slack incoming webhook."""

    def __init__(self) -> None:
        self.settings = get_settings()

    @property
    def enabled(self) -> bool:
        return bool(self.settings.slack_webhook_url)

    async def post_brief(
        self,
        *,
        workspace_name: str,
        headline: str,
        delta_headline: str | None,
        what_changed: str | None,
        severity: str,
        recommended_action: str | None,
        sources: list[dict] | None = None,
        run_id: str | None = None,
    ) -> bool:
        if not self.enabled:
            return False

        sev = (severity or "unknown").lower()
        emoji = _SEVERITY_EMOJI.get(sev, "⚪")

        blocks: list[dict] = [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": f"{emoji}  Intelligence Brief — {workspace_name}", "emoji": True},
            },
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*{headline}*"},
            },
        ]

        if delta_headline:
            blocks.append({
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"📊 `{delta_headline}`"},
            })

        fields = []
        if what_changed:
            fields.append({"type": "mrkdwn", "text": f"*What changed*\n{what_changed[:280]}"})
        fields.append({"type": "mrkdwn", "text": f"*Severity*\n{emoji} {sev.capitalize()}"})
        if fields:
            blocks.append({"type": "section", "fields": fields})

        if recommended_action:
            blocks.append({
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*Recommended action*\n{recommended_action[:300]}"},
            })

        # Top sources (up to 3)
        top_sources = (sources or [])[:3]
        if top_sources:
            source_lines = []
            for s in top_sources:
                url = s.get("source_url") or s.get("url") or ""
                tier = s.get("source_tier") or s.get("tier") or 3
                tier_tag = _TIER_LABEL.get(int(tier), "T3 web")
                entity = s.get("entity_name") or ""
                label = f"{entity} — " if entity else ""
                source_lines.append(f"• [{label}{tier_tag}]({url})" if url else f"• {label}{tier_tag}")
            blocks.append({
                "type": "section",
                "text": {"type": "mrkdwn", "text": "*Sources*\n" + "\n".join(source_lines)},
            })

        blocks.append({"type": "divider"})

        context_parts = [f"Run `{run_id[:8]}`"] if run_id else []
        if sources:
            t1 = sum(1 for s in sources if (s.get("source_tier") or 3) == 1)
            context_parts.append(f"{len(sources)} sources · {t1} official")
        context_parts.append("WebDataOS")
        blocks.append({
            "type": "context",
            "elements": [{"type": "mrkdwn", "text": " · ".join(context_parts)}],
        })

        payload = {"blocks": blocks}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.post(self.settings.slack_webhook_url, json=payload)
                r.raise_for_status()
            logger.info("slack_brief_posted", workspace=workspace_name, severity=sev)
            return True
        except Exception as exc:
            logger.warning("slack_post_failed", error=str(exc))
            return False
