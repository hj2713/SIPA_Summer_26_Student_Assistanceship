import logging
from app.services.embedding.base import EmbeddingProvider
from app.services.embedding.providers.local_provider import LocalEmbeddingProvider

logger = logging.getLogger(__name__)

class EmbeddingService:
    """Facade for EmbeddingProvider interactions."""

    def __init__(self, provider: EmbeddingProvider) -> None:
        self._provider = provider

    @property
    def provider(self) -> EmbeddingProvider:
        return self._provider

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return self._provider.embed_texts(texts)


_embedding_singleton: EmbeddingService | None = None


def get_embedding_service() -> EmbeddingService:
    """Return the process-wide EmbeddingService singleton."""
    global _embedding_singleton
    if _embedding_singleton is None:
        provider = LocalEmbeddingProvider()
        _embedding_singleton = EmbeddingService(provider)
        logger.info("EmbeddingService initialized with LocalEmbeddingProvider")
    return _embedding_singleton


def reset_embedding_service() -> None:
    """Reset the embedding singleton (primarily for testing)."""
    global _embedding_singleton
    _embedding_singleton = None
