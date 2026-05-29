from packages.brightdata.models import BrightDataResult
from packages.schemas.common import FailureType


class FailureDetector:
    def detect(self, result: BrightDataResult) -> tuple[FailureType, str | None]:
        text = (result.text or "").lower()
        status = result.status_code or 200
        if status in {401, 403}:
            if "captcha" in text:
                return FailureType.captcha, "Captcha or access challenge detected"
            return FailureType.blocked, "Blocked or forbidden response"
        if status == 404:
            return FailureType.unknown, "Endpoint or resource not found"
        if status == 429:
            return FailureType.rate_limited, "Rate limited"
        if status >= 500:
            return FailureType.unknown, f"Server error {status}"
        if status >= 400:
            return FailureType.unknown, f"HTTP client error {status}"
        if "geo" in text and "block" in text:
            return FailureType.geo_blocked, "Geo blocking detected"
        if "captcha" in text:
            return FailureType.captcha, "Captcha detected"
        if "enable javascript" in text or "javascript required" in text:
            return FailureType.javascript_required, "JavaScript rendering required"
        if result.json_data == {} or (not result.text and result.json_data in (None, {}, [])):
            return FailureType.empty_response, "Empty response"
        if isinstance(result.json_data, dict) and result.json_data.get("selector_failed"):
            return FailureType.selector_failed, "Selector failed"
        return FailureType.none, None
