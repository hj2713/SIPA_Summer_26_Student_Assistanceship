import logging
from functools import lru_cache

logger = logging.getLogger(__name__)

@lru_cache(maxsize=1)
def _get_cross_encoder(model_name: str):
    """Lazy-load and cache the cross-encoder model."""
    try:
        from sentence_transformers import CrossEncoder  # type: ignore
    except ImportError as exc:
        raise ImportError(
            "sentence-transformers is required for reranking. "
            "Install it with: pip install sentence-transformers\n"
            "Or set ENABLE_RERANKING=false in your .env to skip reranking."
        ) from exc

    logger.info("Loading cross-encoder model: %s (first call only)", model_name)
    return CrossEncoder(model_name)


class LocalRerankerProvider:
    """RerankerProvider utilizing local SentenceTransformers CrossEncoder."""

    def rerank(
        self,
        query: str,
        results: list[dict],
        model_name: str,
        top_n: int,
    ) -> list[dict]:
        if not results:
            return []

        cross_encoder = _get_cross_encoder(model_name)

        # Build (query, document_content) pairs for batch scoring
        pairs = [(query, r["content"]) for r in results]

        # Score all pairs in a single model call
        scores = cross_encoder.predict(pairs)

        # Attach rerank scores and sort descending
        scored = [
            {**r, "rerank_score": float(score)}
            for r, score in zip(results, scores, strict=True)
        ]
        scored.sort(key=lambda x: x["rerank_score"], reverse=True)

        top = scored[:top_n]

        if top:
            logger.info(
                "Reranking complete. %d candidates -> %d results. "
                "Top score: %.4f, Lowest kept: %.4f",
                len(results),
                len(top),
                top[0]["rerank_score"],
                top[-1]["rerank_score"] if len(top) > 1 else top[0]["rerank_score"],
            )

        return top
