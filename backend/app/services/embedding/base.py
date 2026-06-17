from typing import Protocol, runtime_checkable

@runtime_checkable
class EmbeddingProvider(Protocol):
    """Protocol defining vector embedding generation interface."""

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Generate vector embeddings for a list of strings."""
        ...
