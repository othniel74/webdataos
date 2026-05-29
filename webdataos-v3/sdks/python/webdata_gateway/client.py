from __future__ import annotations

import os
from typing import Any

import httpx

from .types import (
    GatewayFetchRequest,
    GatewayFetchResponse,
    ResearchRequest,
    ResearchResponse,
    RetrievalRequest,
    RetrievalResponse,
    TopicCreate,
    TopicResponse,
)


class WebDataGatewayError(RuntimeError):
    """Raised when the gateway API returns an error or invalid response."""


class WebDataGatewayClient:
    """Client for the Self-Healing Web Data Gateway API.

    The same SDK works against a local Docker Compose deployment or a hosted
    gateway. The API key is optional for the current hackathon build, but the
    header is included so the package is ready for production auth.
    """

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout: float = 60.0,
    ) -> None:
        self.base_url = (base_url or os.getenv("WEB_DATA_GATEWAY_URL") or "http://localhost:8000").rstrip("/")
        self.api_key = api_key or os.getenv("WEB_DATA_GATEWAY_API_KEY")
        headers = {"User-Agent": "webdata-gateway-python-sdk/0.1.0"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        self._client = httpx.Client(base_url=self.base_url, timeout=timeout, headers=headers)

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "WebDataGatewayClient":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def _request(self, method: str, path: str, json: dict[str, Any] | None = None) -> Any:
        try:
            response = self._client.request(method, path, json=json)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise WebDataGatewayError(f"Gateway returned {exc.response.status_code}: {exc.response.text}") from exc
        except httpx.HTTPError as exc:
            raise WebDataGatewayError(f"Gateway request failed: {exc}") from exc

        try:
            return response.json()
        except ValueError as exc:
            raise WebDataGatewayError("Gateway returned non-JSON response") from exc

    def fetch(self, request: GatewayFetchRequest | dict[str, Any]) -> GatewayFetchResponse:
        payload = request.to_dict() if isinstance(request, GatewayFetchRequest) else request
        return GatewayFetchResponse.from_dict(self._request("POST", "/gateway/fetch", payload))

    def create_topic(self, topic: TopicCreate | dict[str, Any]) -> TopicResponse:
        payload = topic.to_dict() if isinstance(topic, TopicCreate) else topic
        return TopicResponse.from_dict(self._request("POST", "/intelligence/topics", payload))

    def list_topics(self) -> list[TopicResponse]:
        payload = self._request("GET", "/intelligence/topics")
        return [TopicResponse.from_dict(item) for item in payload]

    def refresh_topic(self, topic_id: str) -> dict[str, Any]:
        return self._request("POST", f"/intelligence/topics/{topic_id}/refresh")

    def retrieve_context(self, request: RetrievalRequest | dict[str, Any]) -> RetrievalResponse:
        payload = request.to_dict() if isinstance(request, RetrievalRequest) else request
        return RetrievalResponse.from_dict(self._request("POST", "/intelligence/retrieve", payload))

    def research(self, request: ResearchRequest | dict[str, Any]) -> ResearchResponse:
        payload = request.to_dict() if isinstance(request, ResearchRequest) else request
        return ResearchResponse.from_dict(self._request("POST", "/agent/research", payload))

    def list_runs(self) -> list[dict[str, Any]]:
        return self._request("GET", "/runs")
