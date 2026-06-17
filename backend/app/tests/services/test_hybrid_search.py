"""Unit tests for hybrid search and reranking logic using SQLite.
"""
import json
from unittest.mock import MagicMock, patch
import pytest

from app.services.retrieval_service import retrieve_context
from app.services.reranking_service import rerank_results
from app.core.database import get_db_conn
from app.core.client import UserClient as LocalClient


def test_retrieve_context_without_reranking():
    user_id = "00000000-0000-0000-0000-000000000001"
    client = LocalClient(user_id)
    
    # Seed document and chunk in SQLite
    with get_db_conn() as conn:
        conn.execute(
            "INSERT INTO documents (id, user_id, filename, file_path, file_size, content_type, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
            ("99999999-9999-9999-9999-999999999999", user_id, "guide.txt", "mock_path", 120, "text/plain", "completed", "{}")
        )
        conn.execute(
            "INSERT INTO document_chunks (id, document_id, user_id, content, embedding, metadata) VALUES (?, ?, ?, ?, ?, ?);",
            ("11111111-1111-1111-1111-111111111111", "99999999-9999-9999-9999-999999999999", user_id, "Hybrid result content. test query", json.dumps([0.1] * 1536), "{}")
        )
        conn.commit()

    fake_embeddings = [[0.1] * 1536]
    with (
        patch("app.services.retrieval_service.generate_embeddings", return_value=fake_embeddings),
        patch("app.services.retrieval_service.settings") as mock_settings
    ):
        mock_settings.RETRIEVAL_CANDIDATE_COUNT = 5
        mock_settings.RETRIEVAL_FINAL_COUNT = 2
        mock_settings.ENABLE_RERANKING = False
        
        results = retrieve_context(client, "test query", limit=2, threshold=0.5)

    assert len(results) == 1
    assert results[0]["chunk_id"] == "11111111-1111-1111-1111-111111111111"
    assert results[0]["filename"] == "guide.txt"
    assert results[0]["content"] == "Hybrid result content. test query"
    assert results[0]["similarity"] > 0.99


@patch("app.services.reranking.registry.RerankingService.rerank")
def test_retrieve_context_with_reranking(mock_rerank):
    user_id = "00000000-0000-0000-0000-000000000001"
    client = LocalClient(user_id)
    
    # Seed document and chunk in SQLite
    with get_db_conn() as conn:
        conn.execute(
            "INSERT INTO documents (id, user_id, filename, file_path, file_size, content_type, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
            ("99999999-9999-9999-9999-999999999999", user_id, "guide.txt", "mock_path", 120, "text/plain", "completed", "{}")
        )
        conn.execute(
            "INSERT INTO document_chunks (id, document_id, user_id, content, embedding, metadata) VALUES (?, ?, ?, ?, ?, ?);",
            ("11111111-1111-1111-1111-111111111111", "99999999-9999-9999-9999-999999999999", user_id, "Hybrid result content. test query", json.dumps([0.1] * 1536), "{}")
        )
        conn.commit()

    fake_embeddings = [[0.1] * 1536]
    reranked_results = [
        {
            "chunk_id": "11111111-1111-1111-1111-111111111111",
            "document_id": "99999999-9999-9999-9999-999999999999",
            "filename": "guide.txt",
            "content": "Hybrid result content. test query",
            "similarity": 1.0,
            "rrf_score": 0.033,
            "rerank_score": 0.95,
            "metadata": {"chunk_index": 0},
        }
    ]
    mock_rerank.return_value = reranked_results

    with (
        patch("app.services.retrieval_service.generate_embeddings", return_value=fake_embeddings),
        patch("app.services.retrieval_service.settings") as mock_settings
    ):
        mock_settings.RETRIEVAL_CANDIDATE_COUNT = 5
        mock_settings.RETRIEVAL_FINAL_COUNT = 2
        mock_settings.ENABLE_RERANKING = True
        mock_settings.RERANK_MODEL = "test-model"
        mock_settings.RERANK_TOP_N = 2
        
        results = retrieve_context(client, "test query", limit=2, threshold=0.5)

    assert len(results) == 1
    assert results[0]["rerank_score"] == 0.95
    mock_rerank.assert_called_once()


@patch("app.services.reranking_service._get_cross_encoder")
def test_rerank_results_ordering(mock_get_cross_encoder):
    mock_encoder = MagicMock()
    mock_encoder.predict.return_value = [0.1, 0.9, 0.5]
    mock_get_cross_encoder.return_value = mock_encoder

    results = [
        {"content": "Doc 1", "id": 1},
        {"content": "Doc 2", "id": 2},
        {"content": "Doc 3", "id": 3},
    ]

    reranked = rerank_results("query", results, "test-model", top_n=2)
    assert len(reranked) == 2
    assert reranked[0]["id"] == 2
    assert reranked[0]["rerank_score"] == 0.9
    assert reranked[1]["id"] == 3
    assert reranked[1]["rerank_score"] == 0.5
