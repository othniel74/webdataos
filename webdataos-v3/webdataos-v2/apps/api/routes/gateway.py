from fastapi import APIRouter, Depends
from packages.gateway.service import GatewayService
from packages.schemas.gateway import GatewayFetchRequest, GatewayFetchResponse
from apps.api.dependencies import authenticated_context, get_gateway_service

router = APIRouter(prefix="/gateway", tags=["Track 3 - Gateway"], dependencies=[Depends(authenticated_context)])


@router.post("/fetch", response_model=GatewayFetchResponse)
async def fetch(request: GatewayFetchRequest, service: GatewayService = Depends(get_gateway_service)):
    return await service.fetch(request)
