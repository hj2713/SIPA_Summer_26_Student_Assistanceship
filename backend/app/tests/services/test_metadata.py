"""Unit tests for metadata extraction and similarity search filtering using SQLite.
"""
import json
from unittest.mock import AsyncMock, MagicMock, patch
from app.schemas.document import DocumentMetadata
from app.services.ingestion_service import extract_metadata_from_text
from app.services.retrieval_service import retrieve_context
from app.core.database import get_db_conn
from app.core.client import UserClient as LocalClient


def test_extract_metadata_from_text():
    """Mocks the provider-neutral LLMService.parse_structured."""
    fake_parsed = DocumentMetadata(
        title="Testing Guide",
        summary="A guide on how to test FastAPI.",
        category="guide",
        tags=["fastapi", "pytest"],
        author="Tester",
        date="2026-05-24",
    )

    mock_llm = MagicMock()
    mock_llm.provider_name = "openai"
    mock_llm.model = "gpt-test"
    mock_llm.parse_structured = AsyncMock(return_value=fake_parsed)

    with patch("app.services.ingestion_service.get_llm", return_value=mock_llm):
        metadata = extract_metadata_from_text("This is text about FastAPI and pytest.")

    assert metadata["title"] == "Testing Guide"
    assert metadata["category"] == "guide"
    assert "fastapi" in metadata["tags"]
    assert metadata["author"] == "Tester"
    mock_llm.parse_structured.assert_awaited_once()


def test_retrieve_context_applies_metadata_filter():
    user_id = "00000000-0000-0000-0000-000000000001"
    client = LocalClient(user_id)
    
    # Seed documents and chunks in SQLite: one matching "guide" category and one "report" category
    with get_db_conn() as conn:
        conn.execute(
            "INSERT INTO documents (id, user_id, filename, file_path, file_size, content_type, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
            ("99999999-9999-9999-9999-999999999999", user_id, "doc_guide.txt", "mock_path_1", 120, "text/plain", "completed", json.dumps({"category": "guide"}))
        )
        conn.execute(
            "INSERT INTO document_chunks (id, document_id, user_id, content, embedding, metadata) VALUES (?, ?, ?, ?, ?, ?);",
            ("11111111-1111-1111-1111-111111111111", "99999999-9999-9999-9999-999999999999", user_id, "RAG filters match content. test query", json.dumps([0.25] * 1536), "{}")
        )
        
        conn.execute(
            "INSERT INTO documents (id, user_id, filename, file_path, file_size, content_type, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
            ("88888888-8888-8888-8888-888888888888", user_id, "doc_report.txt", "mock_path_2", 120, "text/plain", "completed", json.dumps({"category": "report"}))
        )
        conn.execute(
            "INSERT INTO document_chunks (id, document_id, user_id, content, embedding, metadata) VALUES (?, ?, ?, ?, ?, ?);",
            ("22222222-2222-2222-2222-222222222222", "88888888-8888-8888-8888-888888888888", user_id, "Other document text about test query.", json.dumps([0.25] * 1536), "{}")
        )
        conn.commit()

    fake_embeddings = [[0.25] * 1536]

    # Test with category filter
    with patch("app.services.retrieval_service.generate_embeddings", return_value=fake_embeddings):
        results = retrieve_context(
            client,
            "test query",
            limit=3,
            threshold=0.35,
            metadata_filter={"category": "guide"}
        )

    # Should only return the guide document chunk, not the report one
    assert len(results) == 1
    assert results[0]["filename"] == "doc_guide.txt"
    assert results[0]["chunk_id"] == "11111111-1111-1111-1111-111111111111"
