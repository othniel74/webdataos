import time
from collections import defaultdict, deque
from fastapi import HTTPException, Request, status
from packages.common.config import get_settings
from packages.common.security import AuthContext

_BUCKETS: dict[str, deque[float]] = defaultdict(deque)


async def enforce_rate_limit(request: Request, auth: AuthContext | None = None) -> None:
    settings = get_settings()
    if not settings.rate_limit_enabled:
        return
    principal = auth.key_fingerprint if auth else (request.client.host if request.client else "unknown")
    now = time.monotonic()
    window_start = now - 60
    bucket = _BUCKETS[principal]
    while bucket and bucket[0] < window_start:
        bucket.popleft()
    if len(bucket) >= settings.rate_limit_requests_per_minute:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Try again shortly.",
            headers={"Retry-After": "60"},
        )
    bucket.append(now)
