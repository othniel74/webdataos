from __future__ import annotations

import os
import signal
import subprocess
import sys
import time


def _configure_cognee_env() -> None:
    openai_key = os.getenv("OPENAI_API_KEY")
    aimlapi_key = os.getenv("AIMLAPI_API_KEY")

    if openai_key:
        os.environ.setdefault("LLM_PROVIDER", "openai")
        os.environ.setdefault("LLM_MODEL", os.getenv("COGNEE_LLM_MODEL", "openai/gpt-4o-mini"))
        os.environ.setdefault("LLM_API_KEY", openai_key)
        os.environ.setdefault("EMBEDDING_PROVIDER", "openai")
        os.environ.setdefault(
            "EMBEDDING_MODEL",
            os.getenv("COGNEE_EMBEDDING_MODEL", "openai/text-embedding-3-small"),
        )
        os.environ.setdefault("EMBEDDING_API_KEY", openai_key)
    elif aimlapi_key:
        os.environ.setdefault("LLM_PROVIDER", "custom")
        os.environ.setdefault("LLM_MODEL", os.getenv("AIMLAPI_MODEL", "gpt-4o"))
        os.environ.setdefault("LLM_API_KEY", aimlapi_key)
        os.environ.setdefault("LLM_ENDPOINT", os.getenv("AIMLAPI_BASE_URL", "https://api.aimlapi.com/v1"))

    os.environ.setdefault("DATA_ROOT_DIRECTORY", "/data/cognee/data")
    os.environ.setdefault("SYSTEM_ROOT_DIRECTORY", "/data/cognee/system")
    os.environ.setdefault("COGNEE_LOGS_DIR", "/data/cognee/logs")
    os.environ.setdefault("COGNEE_LOG_FILE", "false")
    os.environ.setdefault("TELEMETRY_DISABLED", "true")


def main() -> int:
    _configure_cognee_env()

    import cognee

    ui_port = int(os.getenv("COGNEE_UI_INTERNAL_PORT", "3201"))
    public_port = int(os.getenv("COGNEE_UI_PORT", "3200"))
    backend_port = int(os.getenv("COGNEE_BACKEND_PORT", "8100"))
    pids: list[int | tuple[int, str]] = []

    server = cognee.start_ui(
        pid_callback=pids.append,
        port=ui_port,
        open_browser=False,
        auto_download=True,
        start_backend=True,
        backend_port=backend_port,
    )
    if server is None:
        print("Cognee UI failed to start", file=sys.stderr)
        return 1

    forwarder = subprocess.Popen(
        [
            "socat",
            f"TCP-LISTEN:{public_port},fork,reuseaddr,bind=0.0.0.0",
            f"TCP:127.0.0.1:{ui_port}",
        ]
    )
    print(f"Cognee UI available on 0.0.0.0:{public_port}", flush=True)

    def stop(_: int, __: object) -> None:
        forwarder.terminate()
        server.terminate()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    while server.poll() is None and forwarder.poll() is None:
        time.sleep(1)

    return server.returncode or forwarder.returncode or 0


if __name__ == "__main__":
    raise SystemExit(main())
