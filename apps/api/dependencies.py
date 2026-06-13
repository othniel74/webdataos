from datetime import datetime, timezone
from hashlib import sha256

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.db.models import ManagedAPIKey
from apps.api.db.session import get_db
from packages.gateway.service import GatewayService
from packages.intelligence.service import IntelligenceService
from packages.agents.orchestrator import ResearchAgentOrchestrator
from packages.common.rate_limit import enforce_rate_limit
from packages.common.security import AuthContext, _extract_bearer, require_api_key
from packages.llm.client import LLMClient
from packages.graph.neo4j_client import Neo4jGraphClient
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
_graph = Neo4jGraphClient()
_agent = ResearchAgentOrchestrator(_intelligence, _speechmatics, _memory, _triggerware, _reasoning, _llm, _graph)


async def authenticated_context(
    request: Request,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> AuthContext:
    provided = x_api_key or _extract_bearer(authorization)
    if provided and provided.startswith("wdos_"):
        key_hash = sha256(provided.encode()).hexdigest()
        result = await db.execute(
            select(ManagedAPIKey).where(
                ManagedAPIKey.key_hash == key_hash,
                ManagedAPIKey.revoked.is_(False),
            )
        )
        managed = result.scalar_one_or_none()
        if not managed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid API key")
        now = datetime.now(timezone.utc)
        if managed.expires_at and managed.expires_at.replace(tzinfo=timezone.utc) < now:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="API key has expired")
        managed.last_used_at = now
        await db.commit()
        auth = AuthContext(
            principal=f"managed:{managed.name}",
            key_fingerprint=managed.key_prefix,
            auth_enabled=True,
            tenant_id=managed.tenant_id,
            auth_type="managed_api_key",
        )
        request.state.auth_context = auth
        await enforce_rate_limit(request, auth)
        return auth

    auth = await require_api_key(request, authorization, x_api_key)
    await enforce_rate_limit(request, auth)
    return auth


def require_admin(auth: AuthContext = Depends(authenticated_context)) -> AuthContext:
    if auth.role not in {"admin", "owner"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required for this operation",
        )
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


def get_graph_service() -> Neo4jGraphClient:
    return _graph


def get_llm_client() -> LLMClient:
    return _llm
