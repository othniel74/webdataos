import time
from dataclasses import dataclass
from enum import Enum


class CircuitState(str, Enum):
    closed = "closed"
    open = "open"
    half_open = "half_open"


@dataclass
class CircuitSnapshot:
    name: str
    state: CircuitState
    failures: int
    opened_until: float | None


class CircuitOpenError(RuntimeError):
    pass


class InMemoryCircuitBreaker:
    """Small in-process circuit breaker for one API instance.

    It protects the demo gateway from repeatedly hammering a failing upstream.
    For multi-instance production, replace the storage with Redis/Postgres.
    """

    def __init__(self, failure_threshold: int = 5, reset_seconds: int = 60) -> None:
        self.failure_threshold = failure_threshold
        self.reset_seconds = reset_seconds
        self._state: dict[str, CircuitSnapshot] = {}

    def before_call(self, name: str) -> None:
        snapshot = self._state.get(name)
        if not snapshot:
            return
        if snapshot.state == CircuitState.open:
            if snapshot.opened_until and snapshot.opened_until <= time.monotonic():
                snapshot.state = CircuitState.half_open
                return
            raise CircuitOpenError(f"Circuit is open for {name}")

    def record_success(self, name: str) -> None:
        self._state[name] = CircuitSnapshot(name=name, state=CircuitState.closed, failures=0, opened_until=None)

    def record_failure(self, name: str) -> None:
        snapshot = self._state.get(name) or CircuitSnapshot(name=name, state=CircuitState.closed, failures=0, opened_until=None)
        snapshot.failures += 1
        if snapshot.failures >= self.failure_threshold:
            snapshot.state = CircuitState.open
            snapshot.opened_until = time.monotonic() + self.reset_seconds
        self._state[name] = snapshot

    def snapshot(self) -> list[CircuitSnapshot]:
        return list(self._state.values())
