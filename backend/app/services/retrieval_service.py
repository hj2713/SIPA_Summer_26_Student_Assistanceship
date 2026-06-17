"""Service for hybrid (vector + keyword) search with optional cross-encoder reranking.
"""
import logging
import json
import math
import re
from typing import Any

from app.core.config import settings
from app.core.database import get_db_conn
from app.services.embedding import get_embedding_service, EmbeddingService
from app.services.reranking import get_reranking_service, RerankingService

logger = logging.getLogger(__name__)


# Common English stopwords to ignore in keyword/sparse matching
STOPWORDS = {
    "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours", 
    "yourself", "yourselves", "he", "him", "his", "himself", "she", "her", "hers", "herself", 
    "it", "its", "itself", "they", "them", "their", "theirs", "themselves", "what", "which", 
    "who", "whom", "this", "that", "these", "those", "am", "is", "are", "was", "were", "be", 
    "been", "being", "have", "has", "had", "having", "do", "does", "did", "doing", "a", "an", 
    "the", "and", "but", "if", "or", "because", "as", "until", "while", "of", "at", "by", "for", 
    "with", "about", "against", "between", "into", "through", "during", "before", "after", 
    "above", "below", "to", "from", "up", "down", "in", "out", "on", "off", "over", "under", 
    "again", "further", "then", "once", "here", "there", "when", "where", "why", "how", "all", 
    "any", "both", "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not", 
    "only", "own", "same", "so", "than", "too", "very", "s", "t", "can", "will", "just", "don", 
    "should", "now"
}


def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """Helper module-level function to generate embeddings.
    
    Kept at module level to allow unit tests to patch 'app.services.retrieval_service.generate_embeddings' successfully.
    """
    return get_embedding_service().embed_texts(texts)


class RetrievalService:
    """Class encapsulating hybrid search retrieval and optional reranking logic."""

    def __init__(
        self,
        db_conn_factory=None,
        embedding_service: EmbeddingService = None,
        reranking_service: RerankingService = None,
    ) -> None:
        self.db_conn_factory = db_conn_factory or get_db_conn
        self._embedding_service = embedding_service or get_embedding_service()
        self._reranking_service = reranking_service or get_reranking_service()

    def tokenize(self, text: str) -> list[str]:
        """Tokenize text into lowercase alphanumeric words."""
        return re.findall(r'\w+', text.lower())

    def cosine_similarity(self, v1: list[float], v2: list[float]) -> float:
        """Calculate cosine similarity between two float vectors."""
        if not v1 or not v2 or len(v1) != len(v2):
            return 0.0
        dot_product = sum(a * b for a, b in zip(v1, v2))
        magnitude1 = math.sqrt(sum(a * a for a in v1))
        magnitude2 = math.sqrt(sum(b * b for b in v2))
        if not magnitude1 or not magnitude2:
            return 0.0
        return dot_product / (magnitude1 * magnitude2)

    def matches_filter(self, doc_meta: dict, filter_meta: dict) -> bool:
        """Helper to check if document metadata matches the metadata filter criteria."""
        if not filter_meta:
            return True
        for k, v in filter_meta.items():
            if k == "tags":
                doc_tags = doc_meta.get("tags", [])
                if not isinstance(doc_tags, list):
                    return False
                for tag in v:
                    if tag not in doc_tags:
                        return False
            else:
                if doc_meta.get(k) != v:
                    return False
        return True

    def retrieve_context(
        self,
        client: Any,
        query: str,
        limit: int | None = None,
        threshold: float = 0.35,
        metadata_filter: dict[str, Any] | None = None,
        document_ids: list[str] | None = None,
        document_id: str | None = None,
    ) -> list[dict]:
        """Retrieve relevant chunks via local hybrid search with optional reranking."""
        if not query or not query.strip():
            return []

        if document_id:
            if document_ids is None:
                document_ids = []
            if document_id not in document_ids:
                document_ids.append(document_id)

        workspace_id = getattr(client, "workspace_id", "TEST")
        if not workspace_id:
            logger.warning("retrieve_context called with empty workspace_id in client")
            return []

        # Auto-detect document_ids if query mentions a specific filename in the workspace
        if not document_ids:
            query_lower = query.lower()
            detected_doc_ids = set()
            with self.db_conn_factory() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT id, filename FROM documents WHERE workspace_id = ?;", (str(workspace_id),))
                docs = cursor.fetchall()
                for doc in docs:
                    doc_id, filename = doc
                    filename_clean = filename.lower()
                    name_without_ext = filename_clean.rsplit(".", 1)[0]
                    if (filename_clean in query_lower) or (len(name_without_ext) > 5 and name_without_ext in query_lower):
                        detected_doc_ids.add(doc_id)
            if detected_doc_ids:
                document_ids = list(detected_doc_ids)
                logger.info("Auto-detected document IDs from query filename match: %s", document_ids)

        if document_ids:
            threshold = -1.0
            if not limit or limit == settings.RETRIEVAL_FINAL_COUNT or limit == 5:
                limit = 15

        candidate_count = settings.RETRIEVAL_CANDIDATE_COUNT
        final_count = limit or settings.RETRIEVAL_FINAL_COUNT

        try:
            # 1. Generate query embedding using the module-level function to allow unit test patching
            query_embs = generate_embeddings([query])
            if not query_embs:
                logger.warning("Could not generate embedding for query: %s", query)
                return []
            query_embedding = query_embs[0]

            # 2. Fetch document chunks
            all_chunks = []
            with self.db_conn_factory() as conn:
                cursor = conn.cursor()
                if document_ids:
                    placeholders = ",".join("?" for _ in document_ids)
                    query_str = f"""
                        SELECT dc.id, dc.document_id, dc.content, dc.embedding, dc.metadata as chunk_metadata,
                               d.filename, d.metadata as doc_metadata
                        FROM document_chunks dc
                        JOIN documents d ON dc.document_id = d.id
                        WHERE dc.workspace_id = ? AND dc.document_id IN ({placeholders});
                    """
                    cursor.execute(query_str, [str(workspace_id)] + [str(d_id) for d_id in document_ids])
                else:
                    cursor.execute("""
                        SELECT dc.id, dc.document_id, dc.content, dc.embedding, dc.metadata as chunk_metadata,
                               d.filename, d.metadata as doc_metadata
                        FROM document_chunks dc
                        JOIN documents d ON dc.document_id = d.id
                        WHERE dc.workspace_id = ?;
                    """, (str(workspace_id),))
                all_chunks = [dict(row) for row in cursor.fetchall()]

            # Deserialize fields
            for chunk in all_chunks:
                chunk["embedding"] = json.loads(chunk["embedding"]) if chunk["embedding"] else []
                chunk["chunk_metadata"] = json.loads(chunk["chunk_metadata"]) if chunk["chunk_metadata"] else {}
                chunk["doc_metadata"] = json.loads(chunk["doc_metadata"]) if chunk["doc_metadata"] else {}

            if metadata_filter:
                all_chunks = [c for c in all_chunks if self.matches_filter(c["doc_metadata"], metadata_filter)]

            # Check if summarization query
            is_summary = False
            if document_ids:
                q_lower = query.lower()
                is_summary = any(w in q_lower for w in ["summary", "summarize", "summarise", "outline", "overview", "tl;dr", "tldr"])

            if is_summary:
                sorted_chunks = []
                for chunk in all_chunks:
                    idx = chunk["chunk_metadata"].get("chunk_index", 0)
                    sorted_chunks.append((idx, chunk))
                sorted_chunks.sort(key=lambda x: x[0])

                max_summary_chunks = 100
                truncated_chunks = sorted_chunks[:max_summary_chunks]

                results = []
                for idx, chunk in truncated_chunks:
                    results.append({
                        "chunk_id": chunk["id"],
                        "document_id": chunk["document_id"],
                        "filename": chunk["filename"],
                        "content": chunk["content"],
                        "metadata": chunk["chunk_metadata"],
                        "similarity": 1.0,
                        "rrf_score": 1.0,
                    })
                logger.info("Summarization query detected. Returning %d chunks chronologically.", len(results))
                return results

            # Dense leg (Vector search)
            dense_candidates = []
            for chunk in all_chunks:
                if not chunk["embedding"]:
                    continue
                sim = self.cosine_similarity(query_embedding, chunk["embedding"])
                if sim > threshold:
                    dense_candidates.append({
                        "id": chunk["id"],
                        "document_id": chunk["document_id"],
                        "filename": chunk["filename"],
                        "content": chunk["content"],
                        "metadata": chunk["chunk_metadata"],
                        "similarity": sim,
                    })
            
            dense_candidates.sort(key=lambda x: x["similarity"], reverse=True)
            dense_candidates = dense_candidates[:candidate_count]
            dense_ranks = {item["id"]: (idx + 1) for idx, item in enumerate(dense_candidates)}

            # Sparse leg (Keyword search)
            query_tokens = set(self.tokenize(query))
            meaningful_tokens = {t for t in query_tokens if t not in STOPWORDS}
            search_tokens = meaningful_tokens if meaningful_tokens else query_tokens
            
            sparse_candidates = []
            for chunk in all_chunks:
                chunk_tokens = self.tokenize(chunk["content"])
                score = sum(chunk_tokens.count(term) for term in search_tokens) if chunk_tokens else 0
                
                filename_lower = chunk["filename"].lower()
                filename_match = False
                for token in search_tokens:
                    if len(token) > 4 and token in filename_lower:
                        filename_match = True
                        break
                if filename_match:
                    score += 100.0
                    
                if score > 0:
                    sparse_candidates.append({
                        "id": chunk["id"],
                        "document_id": chunk["document_id"],
                        "filename": chunk["filename"],
                        "content": chunk["content"],
                        "metadata": chunk["chunk_metadata"],
                        "score": score,
                    })
            
            sparse_candidates.sort(key=lambda x: x["score"], reverse=True)
            sparse_candidates = sparse_candidates[:candidate_count]
            sparse_ranks = {item["id"]: (idx + 1) for idx, item in enumerate(sparse_candidates)}

            # Reciprocal Rank Fusion (RRF)
            rrf_k = 60
            merged_map = {}
            
            for item in dense_candidates:
                cid = item["id"]
                rank_v = dense_ranks[cid]
                score_v = 1.0 / (rrf_k + rank_v)
                merged_map[cid] = {
                    "chunk_id": cid,
                    "document_id": item["document_id"],
                    "filename": item["filename"],
                    "content": item["content"],
                    "metadata": item["metadata"],
                    "similarity": item["similarity"],
                    "rrf_score": score_v
                }
                
            for item in sparse_candidates:
                cid = item["id"]
                rank_k = sparse_ranks[cid]
                score_k = 1.0 / (rrf_k + rank_k)
                if cid in merged_map:
                    merged_map[cid]["rrf_score"] += score_k
                else:
                    merged_map[cid] = {
                        "chunk_id": cid,
                        "document_id": item["document_id"],
                        "filename": item["filename"],
                        "content": item["content"],
                        "metadata": item["metadata"],
                        "similarity": 0.0,
                        "rrf_score": score_k
                    }

            results = list(merged_map.values())
            results.sort(key=lambda x: x["rrf_score"], reverse=True)

            # Reranking
            if settings.ENABLE_RERANKING and results:
                logger.info("Reranking %d candidates with model: %s", len(results), settings.RERANK_MODEL)
                results = self._reranking_service.rerank(
                    query=query,
                    results=results,
                    model_name=settings.RERANK_MODEL,
                    top_n=settings.RERANK_TOP_N,
                )
            else:
                results = results[:final_count]

            if results and (document_ids or len(results) > 1):
                results.sort(key=lambda x: (x["filename"], x["metadata"].get("chunk_index", 0)))

            logger.info(
                "Retrieved %d context chunks for query: %s (reranking=%s)",
                len(results),
                query,
                settings.ENABLE_RERANKING,
            )
            return results

        except Exception as e:
            logger.error("Failed to retrieve context for query '%s': %s", query, e, exc_info=True)
            return []


# Process-wide singleton instance for dependency injection & route integration
retrieval_service = RetrievalService()


# Backward-compatible functional delegates
def tokenize(text: str) -> list[str]:
    return retrieval_service.tokenize(text)


def cosine_similarity(v1: list[float], v2: list[float]) -> float:
    return retrieval_service.cosine_similarity(v1, v2)


def matches_filter(doc_meta: dict, filter_meta: dict) -> bool:
    return retrieval_service.matches_filter(doc_meta, filter_meta)


def retrieve_context(
    client: Any,
    query: str,
    limit: int | None = None,
    threshold: float = 0.35,
    metadata_filter: dict[str, Any] | None = None,
    document_ids: list[str] | None = None,
    document_id: str | None = None,
) -> list[dict]:
    return retrieval_service.retrieve_context(
        client, query, limit, threshold, metadata_filter, document_ids, document_id
    )
