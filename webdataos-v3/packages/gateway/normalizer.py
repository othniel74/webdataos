from typing import Any
from packages.brightdata.models import BrightDataResult


class ResultNormalizer:
    def normalize(self, result: BrightDataResult, output_schema: dict[str, Any] | None = None) -> tuple[dict[str, Any], str | None, float]:
        payload = result.json_data
        text = result.text
        data: dict[str, Any] = {}
        if isinstance(payload, dict):
            data = payload
        elif isinstance(payload, list):
            data = {"items": payload}
        elif text:
            data = {"content": text[:4000]}

        if output_schema:
            for key, default_type in output_schema.items():
                data.setdefault(key, None if default_type != "list" else [])

        confidence = 0.85 if data else 0.0
        if result.metadata.get("mock"):
            confidence = 0.78
        return data, text, confidence
