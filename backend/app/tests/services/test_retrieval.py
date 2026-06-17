"""Unit tests for the RAG retrieval service using local SQLite.
"""
import json
from unittest.mock import patch
from app.services.retrieval_service import retrieve_context
from app.core.database import get_db_conn
from app.core.client import UserClient as LocalClient


def test_retrieve_context_empty():
    client = LocalClient("00000000-0000-0000-0000-000000000001")
    assert retrieve_context(client, "") == []
    assert retrieve_context(client, "   ") == []


def test_retrieve_context_happy_path():
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
            ("11111111-1111-1111-1111-111111111111", "99999999-9999-9999-9999-999999999999", user_id, "Retrieval result chunk content. test query", json.dumps([0.1] * 1536), "{}")
        )
        conn.commit()

    fake_embeddings = [[0.1] * 1536]
    with patch("app.services.retrieval_service.generate_embeddings", return_value=fake_embeddings):
        results = retrieve_context(client, "test query", limit=2, threshold=0.5)

    assert len(results) == 1
    assert results[0]["chunk_id"] == "11111111-1111-1111-1111-111111111111"
    assert results[0]["filename"] == "guide.txt"
    assert results[0]["content"] == "Retrieval result chunk content. test query"
    assert results[0]["similarity"] > 0.99


def test_retrieve_context_targeted_document():
    user_id = "00000000-0000-0000-0000-000000000001"
    client = LocalClient(user_id)
    doc_id_1 = "88888888-8888-8888-8888-888888888888"
    doc_id_2 = "77777777-7777-7777-7777-777777777777"
    
    with get_db_conn() as conn:
        conn.execute(
            "INSERT INTO documents (id, user_id, filename, file_path, file_size, content_type, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
            (doc_id_1, user_id, "doc1.txt", "path1", 100, "text/plain", "completed", "{}")
        )
        conn.execute(
            "INSERT INTO documents (id, user_id, filename, file_path, file_size, content_type, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
            (doc_id_2, user_id, "doc2.txt", "path2", 100, "text/plain", "completed", "{}")
        )
        conn.execute(
            "INSERT INTO document_chunks (id, document_id, user_id, content, embedding, metadata) VALUES (?, ?, ?, ?, ?, ?);",
            ("chunk-111", doc_id_1, user_id, "Target text inside document one", json.dumps([0.2] * 1536), "{}")
        )
        conn.execute(
            "INSERT INTO document_chunks (id, document_id, user_id, content, embedding, metadata) VALUES (?, ?, ?, ?, ?, ?);",
            ("chunk-222", doc_id_2, user_id, "Target text inside document two", json.dumps([0.2] * 1536), "{}")
        )
        conn.commit()

    fake_embeddings = [[0.2] * 1536]
    with patch("app.services.retrieval_service.generate_embeddings", return_value=fake_embeddings):
        # 1. Target doc_id_1
        res1 = retrieve_context(client, "Target text", limit=5, document_id=doc_id_1)
        assert len(res1) == 1
        assert res1[0]["chunk_id"] == "chunk-111"
        assert res1[0]["filename"] == "doc1.txt"

        # 2. Target doc_id_2
        res2 = retrieve_context(client, "Target text", limit=5, document_id=doc_id_2)
        assert len(res2) == 1
        assert res2[0]["chunk_id"] == "chunk-222"
        assert res2[0]["filename"] == "doc2.txt"

        # 3. Test threshold bypass: even with a threshold of 1.0 (impossible match), it should return the chunk when targeted
        res3 = retrieve_context(client, "Non-matching query text", limit=5, threshold=1.0, document_id=doc_id_1)
        assert len(res3) == 1
        assert res3[0]["chunk_id"] == "chunk-111"


def test_retrieve_context_targeted_multiple_documents():
    user_id = "00000000-0000-0000-0000-000000000001"
    client = LocalClient(user_id)
    doc_id_1 = "99999999-9999-9999-9999-999999999999"
    doc_id_2 = "88888888-8888-8888-8888-888888888888"
    doc_id_3 = "77777777-7777-7777-7777-777777777777"
    
    with get_db_conn() as conn:
        conn.execute(
            "INSERT INTO documents (id, user_id, filename, file_path, file_size, content_type, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
            (doc_id_1, user_id, "doc1.txt", "path1", 100, "text/plain", "completed", "{}")
        )
        conn.execute(
            "INSERT INTO documents (id, user_id, filename, file_path, file_size, content_type, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
            (doc_id_2, user_id, "doc2.txt", "path2", 100, "text/plain", "completed", "{}")
        )
        conn.execute(
            "INSERT INTO documents (id, user_id, filename, file_path, file_size, content_type, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
            (doc_id_3, user_id, "doc3.txt", "path3", 100, "text/plain", "completed", "{}")
        )
        conn.execute(
            "INSERT INTO document_chunks (id, document_id, user_id, content, embedding, metadata) VALUES (?, ?, ?, ?, ?, ?);",
            ("chunk-111", doc_id_1, user_id, "Target text inside document one", json.dumps([0.2] * 1536), "{}")
        )
        conn.execute(
            "INSERT INTO document_chunks (id, document_id, user_id, content, embedding, metadata) VALUES (?, ?, ?, ?, ?, ?);",
            ("chunk-222", doc_id_2, user_id, "Target text inside document two", json.dumps([0.2] * 1536), "{}")
        )
        conn.execute(
            "INSERT INTO document_chunks (id, document_id, user_id, content, embedding, metadata) VALUES (?, ?, ?, ?, ?, ?);",
            ("chunk-333", doc_id_3, user_id, "Target text inside document three", json.dumps([0.2] * 1536), "{}")
        )
        conn.commit()

    fake_embeddings = [[0.2] * 1536]
    with patch("app.services.retrieval_service.generate_embeddings", return_value=fake_embeddings):
        # Target doc_id_1 and doc_id_2 (exclude doc_id_3)
        res = retrieve_context(client, "Target text", limit=5, document_ids=[doc_id_1, doc_id_2])
        assert len(res) == 2
        chunk_ids = {r["chunk_id"] for r in res}
        assert "chunk-111" in chunk_ids
        assert "chunk-222" in chunk_ids
        assert "chunk-333" not in chunk_ids


