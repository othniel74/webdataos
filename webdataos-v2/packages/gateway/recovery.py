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
            if current != ToolName.web_unlocker:
                return ToolName.web_unlocker
            if current != ToolName.scraping_browser:
                return ToolName.scraping_browser
            if current != ToolName.mcp_server:
                return ToolName.mcp_server
        if failure in {FailureType.javascript_required, FailureType.empty_response, FailureType.selector_failed}:
            if current != ToolName.scraping_browser:
                return ToolName.scraping_browser
            if current != ToolName.mcp_server:
                return ToolName.mcp_server
            if current != ToolName.web_unlocker:
                return ToolName.web_unlocker
        if current == ToolName.web_scraper_api:
            return ToolName.scraping_browser
        if current == ToolName.scraping_browser:
            return ToolName.mcp_server
        if current == ToolName.mcp_server:
            return ToolName.web_unlocker
        return None
