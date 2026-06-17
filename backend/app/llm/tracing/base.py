"""Tracer protocol — minimal surface so adding new vendors stays cheap."""
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class Tracer(Protocol):
    """Wraps SDK clients so calls are auto-instrumented.

    Adapters that need explicit spans can extend this interface later;
    for now `wrap_client` is enough because the popular tracers
    (LangSmith, Helicone, Langfuse) all expose a wrap-and-go helper.
    """

    @property
    def name(self) -> str:
        """Short identifier for this tracer ('langsmith', 'noop', ...)."""
        ...

    def wrap_client(self, client: Any, *, provider: str) -> Any:
        """Return an instrumented version of `client` for `provider`.

        Must be a no-op (return the same object) if the tracer doesn't
        support the given provider, so callers can safely wrap any client.
        """
        ...
