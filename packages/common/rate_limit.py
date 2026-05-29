"""Rate limiting with Redis primary and in-memory fallback.

Uses a sliding-window counter in Redis when REDIS_URL is configured.
Falls back to in-process deque when Redis is unavailable so the API
stays up even if Redis is down — degraded but not broken.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from packages.common.config import get_settings
from packages.common.logging import get_logger
from packages.common.security import AuthContext

logger = get_logger(__name__)

# ── In-memory fallback (single-process only) ──────────────────────────
_BUCKETS: dict[str, deque[float]] = defaultdict(deque)

# ── Redis client (lazy, optional) ─────────────────────────────────────
_redis_client = None
_redis_available: bool | None = None  # None = not yet checked


def _get_redis():
    global _redis_client, _redis_available
    if _redis_available is False:
        return None
    if _redis_client is not None:
        return _redis_client
    settings = get_settings()
    redis_url = getattr(settings, "redis_url", None)
    if not redis_url:
        _redis_available = False
        return None
    try:
        import redis as redis_lib
        client = redis_lib.from_url(redis_url, decode_responses=True, socket_timeout=0.5)
        client.ping()
        _redis_client = client
        _redis_available = True
        logger.info("rate_limit_redis_connected", url=redis_url.split("@")[-1])
        return _redis_client
    except Exception as exc:
        _redis_available = False
        logger.warning("rate_limit_redis_unavailable", error=str(exc)[:120], fallback="in_memory")
        return None


def _redis_sliding_window(key: str, limit: int, window_seconds: int = 60) -> int:
    """Atomic sliding-window counter in Redis. Returns current request count."""
    r = _get_redis()
    if r is None:
        return -1  # signals: use in-memory fallback
    now_ms = int(time.time() * 1000)
    pipe = r.pipeline()
    pipe.zremrangebyscore(key, 0, now_ms - window_seconds * 1000)
    pipe.zadd(key, {str(now_ms): now_ms})
    pipe.zcard(key)
    pipe.expire(key, window_seconds * 2)
    results = pipe.execute()
    return results[2]  # zcard result = current count in window


def _in_memory_sliding_window(key: str, limit: int, window_seconds: int = 60) -> int:
    now = time.monotonic()
    window_start = now - window_seconds
    bucket = _BUCKETS[key]
    while bucket and bucket[0] < window_start:
        bucket.popleft()
    bucket.append(now)
    return len(bucket)


async def enforce_rate_limit(request: Request, auth: AuthContext | None = None) -> None:
    settings = get_settings()
    if not settings.rate_limit_enabled:
        return

    principal = (
        auth.key_fingerprint if auth
        else (request.client.host if request.client else "unknown")
    )
    limit = settings.rate_limit_requests_per_minute
    key = f"rl:{principal}"

    count = _redis_sliding_window(key, limit)
    if count == -1:
        count = _in_memory_sliding_window(key, limit)

    if count > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Try again shortly.",
            headers={"Retry-After": "60"},
        )
