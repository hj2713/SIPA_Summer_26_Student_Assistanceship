"""Backward-compatibility shim for reranking_service.py.
"""
from app.services.reranking.providers.local_provider import _get_cross_encoder as _real_get_cross_encoder


def _get_cross_encoder(model_name: str):
    """Delegate to the real cross encoder loader, allowing test patches."""
    return _real_get_cross_encoder(model_name)


def rerank_results(
    query: str,
    results: list[dict],
    model_name: str,
    top_n: int,
) -> list[dict]:
    """Shim implementation using the local _get_cross_encoder for mock patch support."""
    if not results:
        return []

    cross_encoder = _get_cross_encoder(model_name)
    pairs = [(query, r["content"]) for r in results]
    scores = cross_encoder.predict(pairs)
    
    scored = [
        {**r, "rerank_score": float(score)}
        for r, score in zip(results, scores, strict=True)
    ]
    scored.sort(key=lambda x: x["rerank_score"], reverse=True)
    return scored[:top_n]
