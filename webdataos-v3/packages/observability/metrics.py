from prometheus_client import Counter, Histogram, Gauge

GATEWAY_REQUESTS = Counter("gateway_requests_total", "Gateway requests", ["tool", "status"])
GATEWAY_RECOVERY_ATTEMPTS = Counter(
    "gateway_recovery_attempts_total", "Gateway recovery attempts", ["failure_type", "tool"]
)
GATEWAY_LATENCY = Histogram("gateway_latency_seconds", "Gateway latency seconds", ["tool"])
RECORDS_REFRESHED = Counter("records_refreshed_total", "Intelligence records refreshed", ["topic_id"])
STALE_RECORDS = Gauge("stale_records_count", "Number of stale records", ["topic_id"])
AGENT_RUNS = Counter("agent_runs_total", "Agent runs", ["status"])
AGENT_RUN_DURATION = Histogram("agent_run_duration_seconds", "Agent run duration seconds")
