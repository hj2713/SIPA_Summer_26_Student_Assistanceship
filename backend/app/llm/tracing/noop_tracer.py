"""No-op tracer used when observability is disabled."""
from typing import Any


class NoopTracer:
    name = "noop"

    def wrap_client(self, client: Any, *, provider: str) -> Any:
        return client
