from __future__ import annotations

from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends

from apps.api.dependencies import authenticated_context
from packages.common.config import get_settings

router = APIRouter(tags=["LLM Providers"], dependencies=[Depends(authenticated_context)])


@router.get("/llm/providers")
async def llm_providers():
    settings = get_settings()
    providers = []
    if settings.openai_api_key:
        providers.append(
            {
                "provider": "openai",
                "model": settings.openai_model,
                "role": "primary",
                "base_url": "https://api.openai.com/v1",
            }
        )
    if settings.aimlapi_api_key:
        providers.append(
            {
                "provider": "aimlapi",
                "model": settings.aimlapi_model,
                "role": "fallback",
                "base_url": settings.aimlapi_base_url,
                "models_url": settings.aimlapi_models_url,
                "note": "AI/ML API can route to many model vendors; set AIMLAPI_MODEL to choose one.",
            }
        )
    return {
        "available": bool(providers),
        "fallback_order": [provider["provider"] for provider in providers],
        "providers": providers,
    }


@router.get("/llm/aimlapi/models")
async def aimlapi_models():
    settings = get_settings()
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(settings.aimlapi_models_url)
        response.raise_for_status()
        data = response.json()

    parsed_base = urlparse(settings.aimlapi_base_url)
    models = data.get("data", data) if isinstance(data, dict) else data
    chat_models = [
        model
        for model in models
        if isinstance(model, dict)
        and (
            model.get("type") in {"chat-completion", "openai/chat-completions"}
            or "/v1/chat/completions" in model.get("endpoints", [])
            or "playground:chat" in model.get("tags", [])
        )
    ]
    return {
        "base_url": settings.aimlapi_base_url,
        "models_url": settings.aimlapi_models_url,
        "configured_model": settings.aimlapi_model,
        "host": parsed_base.netloc,
        "count": len(chat_models),
        "models": chat_models[:200],
    }
