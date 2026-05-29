from fastapi import Depends, Request
from packages.gateway.service import GatewayService
from packages.intelligence.service import IntelligenceService
from packages.agents.orchestrator import ResearchAgentOrchestrator
from packages.common.rate_limit import enforce_rate_limit
from packages.common.security import AuthContext, require_api_key
from packages.llm.client import LLMClient
from packages.memory.embeddings import EmbeddingClient
from packages.memory.provider import MemoryProvider
from packages.memory.service import MemoryService
from packages.partners.cognee import CogneeMemoryService
from packages.partners.speechmatics import SpeechmaticsService
from packages.partners.triggerware import TriggerWareService
from packages.reasoning.engine import ReasoningEngine

_gateway = GatewayService()
_intelligence = IntelligenceService(_gateway)
_speechmatics = SpeechmaticsService()
_cognee = CogneeMemoryService()
_embedder = EmbeddingClient()
_self_hosted_memory = MemoryService(embedder=_embedder)
_memory = MemoryProvider(cognee=_cognee, self_hosted=_self_hosted_memory)
_triggerware = TriggerWareService()
_reasoning = ReasoningEngine()
_llm = LLMClient()
_agent = ResearchAgentOrchestrator(_intelligence, _speechmatics, _memory, _triggerware, _reasoning, _llm)


async def authenticated_context(
    request: Request,
    auth: AuthContext = Depends(require_api_key),
) -> AuthContext:
    await enforce_rate_limit(request, auth)
    return auth


def get_gateway_service() -> GatewayService:
    return _gateway


def get_intelligence_service() -> IntelligenceService:
    return _intelligence


def get_agent_orchestrator() -> ResearchAgentOrchestrator:
    return _agent


def get_speechmatics_service() -> SpeechmaticsService:
    return _speechmatics


def get_memory_service() -> MemoryService:
    return _self_hosted_memory


def get_cognee_service() -> CogneeMemoryService:
    return _cognee


def get_memory_provider() -> MemoryProvider:
    return _memory


def get_triggerware_service() -> TriggerWareService:
    return _triggerware
