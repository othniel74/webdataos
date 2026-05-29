import asyncio
from packages.gateway.service import GatewayService
from packages.schemas.gateway import GatewayFetchRequest
from packages.schemas.common import ToolName


async def main():
    gateway = GatewayService()
    result = await gateway.fetch(
        GatewayFetchRequest(
            url="https://example.com/pricing",
            task_type="pricing_extraction",
            preferred_tool=ToolName.web_scraper_api,
            output_schema={"company": "string", "pricing_model": "string", "features": "list"},
        )
    )
    print(result.model_dump_json(indent=2))


if __name__ == "__main__":
    asyncio.run(main())
