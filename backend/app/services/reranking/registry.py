import logging
from app.services.reranking.base import RerankerProvider
from app.services.reranking.providers.local_provider import LocalRerankerProvider

logger = logging.getLogger(__name__)

class RerankingService:
    """Facade for RerankerProvider interactions."""

    def __init__(self, provider: RerankerProvider) -> None:
        self._provider = provider

    @property
    def provider(self) -> RerankerProvider:
        return self._provider

    def rerank(
        self,
        query: str,
        results: list[dict],
        model_name: str,
        top_n: int,
    ) -> list[dict]:
        return self._provider.rerank(query, results, model_name, top_n)


_reranking_singleton: RerankingService | None = None


def get_reranking_service() -> RerankingService:
    """Return the process-wide RerankingService singleton."""
    global _reranking_singleton
    if _reranking_singleton is None:
        provider = LocalRerankerProvider()
        _reranking_singleton = RerankingService(provider)
        logger.info("RerankingService initialized with LocalRerankerProvider")
    return _reranking_singleton


def reset_reranking_service() -> None:
    """Reset the reranking singleton (primarily for testing)."""
    global _reranking_singleton
    _reranking_singleton = None
