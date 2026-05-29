"""Python SDK for the Self-Healing Web Data Gateway.

The SDK is intentionally API-first: production developers can point it at a
hosted gateway service, while local hackathon users can point it at the
Docker Compose FastAPI service running on localhost.
"""

from .client import WebDataGatewayClient, WebDataGatewayError
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

__all__ = [
    "WebDataGatewayClient",
    "WebDataGatewayError",
    "GatewayFetchRequest",
    "GatewayFetchResponse",
    "ResearchRequest",
    "ResearchResponse",
    "RetrievalRequest",
    "RetrievalResponse",
    "TopicCreate",
    "TopicResponse",
]
