from packages.schemas.common import FailureType, ToolName


class RecoveryRouter:
    """Chooses the next Bright Data tool after a failure."""

    def choose_initial(self, preferred: ToolName | None, has_query: bool) -> ToolName:
        if preferred:
            return preferred
        if has_query:
            return ToolName.serp_api
        return ToolName.web_scraper_api

    def next_tool(self, current: ToolName, failure: FailureType) -> ToolName | None:
        if failure == FailureType.none:
            return None
        if failure in {FailureType.blocked, FailureType.captcha, FailureType.geo_blocked, FailureType.rate_limited}:
            return self._next_in_sequence(current, [ToolName.web_unlocker, ToolName.scraping_browser])
        if failure in {FailureType.javascript_required, FailureType.empty_response, FailureType.selector_failed}:
            return self._next_in_sequence(current, [ToolName.scraping_browser, ToolName.web_unlocker])
        if current == ToolName.web_scraper_api:
            return ToolName.scraping_browser
        if current == ToolName.scraping_browser:
            return ToolName.web_unlocker
        return None

    def _next_in_sequence(self, current: ToolName, sequence: list[ToolName]) -> ToolName | None:
        if current not in sequence:
            return sequence[0]
        next_index = sequence.index(current) + 1
        if next_index >= len(sequence):
            return None
        return sequence[next_index]
