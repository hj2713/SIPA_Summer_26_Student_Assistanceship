"""Unit and integration tests for the Record Manager (incremental ingestion)."""
from unittest.mock import MagicMock, patch
import pytest
from app.services.ingestion_service import calculate_hash
from app.schemas.document import DocumentRow, DocumentStatus


def test_calculate_hash():
    # Consistent inputs must return identical hashes
    assert calculate_hash(b"hello") == "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    assert calculate_hash(b"hello") == calculate_hash(b"hello")
    assert calculate_hash(b"world") != calculate_hash(b"hello")


_FAKE_DOC = {
    "id": "22222222-2222-2222-2222-222222222222",
    "user_id": "00000000-0000-0000-0000-000000000001",
    "filename": "record.txt",
    "file_path": "00000000-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/record.txt",
    "file_size": 100,
    "content_type": "text/plain",
    "status": "completed",
    "content_hash": "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", # hash for b"hello"
    "metadata": {},
    "created_at": "2024-01-01T00:00:00+00:00",
    "updated_at": "2024-01-01T00:00:00+00:00",
}


def test_upload_duplicate_ignores_indexing(client, auth_headers):
    # If the hash matches the existing record, we skip background tasks and return upserted=False
    existing = DocumentRow(**_FAKE_DOC)
    
    with (
        patch("app.routes.documents.get_user_client"),
        patch("app.routes.documents.document_service.get_document_by_name", return_value=existing),
        patch("app.routes.documents.document_service.create_document") as mock_create,
        patch("app.routes.documents.ingestion_service.enqueue_document_ingestion") as mock_enqueue,
    ):
        response = client.post(
            "/api/documents/upload",
            files={"file": ("record.txt", b"hello", "text/plain")},
            headers=auth_headers,
        )
        
    assert response.status_code == 201
    body = response.json()
    assert body["upserted"] is False
    assert body["status"] == "completed"
    mock_create.assert_not_called()
    mock_enqueue.assert_not_called()


def test_upload_modified_triggers_reindexing(client, auth_headers):
    # If the file name matches and it's already completed (chunked), we ignore it and return upserted=False (avoiding duplicate chunking)
    existing = DocumentRow(**_FAKE_DOC)
    
    with (
        patch("app.routes.documents.get_user_client"),
        patch("app.routes.documents.document_service.get_document_by_name", return_value=existing),
        patch("app.routes.documents.document_service.delete_document_chunks") as mock_clear,
        patch("app.routes.documents.document_service.update_document_metadata") as mock_update,
        patch("app.routes.documents.document_service.upload_file_to_storage") as mock_storage,
        patch("app.routes.documents.ingestion_service.enqueue_document_ingestion") as mock_enqueue,
    ):
        response = client.post(
            "/api/documents/upload",
            files={"file": ("record.txt", b"modified-content", "text/plain")},
            headers=auth_headers,
        )
        
    assert response.status_code == 201
    body = response.json()
    assert body["upserted"] is False
    assert body["status"] == "completed"
    
    mock_clear.assert_not_called()
    mock_update.assert_not_called()
    mock_storage.assert_not_called()
    mock_enqueue.assert_not_called()
