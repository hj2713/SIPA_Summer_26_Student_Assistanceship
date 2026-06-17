from typing import Protocol, runtime_checkable

@runtime_checkable
class RerankerProvider(Protocol):
    """Protocol defining joint query-document reranking interface."""

    def rerank(
        self,
        query: str,
        results: list[dict],
        model_name: str,
        top_n: int,
    ) -> list[dict]:
        """Rerank candidates based on joint query-document matching."""
        ...
