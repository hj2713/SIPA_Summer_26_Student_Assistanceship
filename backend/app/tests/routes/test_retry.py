"""Unit and integration tests for document retry endpoints."""
from unittest.mock import MagicMock, patch
import pytest
from app.schemas.document import DocumentRow, DocumentStatus


_MOCK_DOC = {
    "id": "33333333-3333-3333-3333-333333333333",
    "user_id": "00000000-0000-0000-0000-000000000001",
    "filename": "retry-me.txt",
    "file_path": "00000000-0000-0000-0000-000000000001/33333333-3333-3333-3333-333333333333/retry-me.txt",
    "file_size": 120,
    "content_type": "text/plain",
    "status": "failed",
    "content_hash": "mock-hash",
    "metadata": {},
    "created_at": "2024-01-01T00:00:00+00:00",
    "updated_at": "2024-01-01T00:00:00+00:00",
}


def test_retry_single_document(client, auth_headers):
    # Setup mock document
    existing = DocumentRow(**_MOCK_DOC)
    updated_doc = DocumentRow(**{**_MOCK_DOC, "status": "pending"})
    
    mock_supabase = MagicMock()
    
    with (
        patch("app.routes.documents.get_user_client", return_value=mock_supabase),
        patch("app.routes.documents.document_service.get_document", return_value=existing),
        patch("app.routes.documents.document_service.download_file_from_storage", return_value=b"retried file content") as mock_download,
        patch("app.routes.documents.document_service.delete_document_chunks") as mock_delete,
        patch("app.routes.documents.document_service.update_document_metadata", return_value=updated_doc) as mock_update,
        patch("app.routes.documents.ingestion_service.enqueue_document_ingestion") as mock_enqueue,
    ):
        response = client.post(
            f"/api/documents/{existing.id}/retry",
            headers=auth_headers,
        )
        
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "pending"
    assert body["id"] == str(existing.id)
    
    mock_download.assert_called_once_with(mock_supabase, existing.file_path)
    mock_delete.assert_called_once_with(mock_supabase, str(existing.id))
    mock_update.assert_called_once()
    mock_enqueue.assert_called_once_with(
        doc_id=str(existing.id),
        user_id="00000000-0000-0000-0000-000000000001",
        filename="retry-me.txt",
        content=b"retried file content",
        content_type="text/plain",
        workspace_id="TEST",
    )


def test_retry_batch_documents(client, auth_headers):
    existing = DocumentRow(**_MOCK_DOC)
    updated_doc = DocumentRow(**{**_MOCK_DOC, "status": "pending"})
    
    mock_supabase = MagicMock()
    
    with (
        patch("app.routes.documents.get_user_client", return_value=mock_supabase),
        patch("app.routes.documents.document_service.get_document", return_value=existing),
        patch("app.routes.documents.document_service.download_file_from_storage", return_value=b"batch retried file content") as mock_download,
        patch("app.routes.documents.document_service.delete_document_chunks") as mock_delete,
        patch("app.routes.documents.document_service.update_document_metadata", return_value=updated_doc) as mock_update,
        patch("app.routes.documents.ingestion_service.enqueue_document_ingestion") as mock_enqueue,
    ):
        response = client.post(
            "/api/documents/retry-batch",
            json={"document_ids": [str(existing.id)]},
            headers=auth_headers,
        )
        
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["status"] == "pending"
    assert body[0]["id"] == str(existing.id)
    
    mock_download.assert_called_once_with(mock_supabase, existing.file_path)
    mock_delete.assert_called_once_with(mock_supabase, str(existing.id))
    mock_update.assert_called_once()
    mock_enqueue.assert_called_once_with(
        doc_id=str(existing.id),
        user_id="00000000-0000-0000-0000-000000000001",
        filename="retry-me.txt",
        content=b"batch retried file content",
        content_type="text/plain",
        workspace_id="TEST",
    )
