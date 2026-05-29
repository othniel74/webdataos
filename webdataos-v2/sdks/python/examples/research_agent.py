from webdata_gateway import ResearchRequest, WebDataGatewayClient


def main() -> None:
    with WebDataGatewayClient() as client:
        report = client.research(
            ResearchRequest(
                task="Research AI agent infrastructure companies and compare positioning, pricing signals, and recent updates.",
                topic_id="ai_agent_infrastructure",
                freshness_required="7_days",
                max_sources=8,
            )
        )
        print(report.summary)
        print(report.sources)


if __name__ == "__main__":
    main()
