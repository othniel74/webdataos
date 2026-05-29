from webdata_gateway import GatewayFetchRequest, WebDataGatewayClient


def main() -> None:
    with WebDataGatewayClient() as client:
        response = client.fetch(
            GatewayFetchRequest(
                url="https://example.com/pricing",
                task_type="pricing_extraction",
                preferred_tool="web_scraper_api",
                output_schema={
                    "company": "string",
                    "pricing_model": "string",
                    "features": "list",
                },
            )
        )
        print(response.status)
        print(response.tool_used)
        print(response.data)


if __name__ == "__main__":
    main()
