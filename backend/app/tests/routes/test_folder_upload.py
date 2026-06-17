"""Unit and integration tests for folder/relative-path ingestion."""
from unittest.mock import MagicMock, patch
import pytest
from app.schemas.document import DocumentRow, DocumentStatus


def test_upload_with_relative_path(client, auth_headers):
    # When relative_path is provided, it should be used as the filename in create_document
    fake_doc = {
        "id": "11111111-1111-1111-1111-111111111111",
        "user_id": "00000000-0000-0000-0000-000000000001",
        "filename": "my-folder/subfolder/file.txt",
        "file_path": "00000000-0000-0000-0000-000000000001/11111111-1111-1111-1111-111111111111/file.txt",
        "file_size": 100,
        "content_type": "text/plain",
        "status": "pending",
        "content_hash": "hash-value",
        "metadata": {},
        "created_at": "2024-01-01T00:00:00+00:00",
        "updated_at": "2024-01-01T00:00:00+00:00",
    }
    doc_row = DocumentRow(**fake_doc)
    
    with (
        patch("app.routes.documents.get_user_client"),
        patch("app.routes.documents.document_service.get_document_by_name", return_value=None),
        patch("app.routes.documents.document_service.create_document", return_value=doc_row) as mock_create,
        patch("app.routes.documents.document_service.upload_file_to_storage", return_value="storage-path") as mock_storage,
        patch("app.routes.documents.ingestion_service.enqueue_document_ingestion") as mock_enqueue,
    ):
        response = client.post(
            "/api/documents/upload",
            data={"relative_path": "my-folder/subfolder/file.txt"},
            files={"file": ("file.txt", b"folder file content", "text/plain")},
            headers=auth_headers,
        )
        
    assert response.status_code == 201
    body = response.json()
    assert body["filename"] == "my-folder/subfolder/file.txt"
    assert body["upserted"] is True
    
    # Verify that the create_document was called with the relative path as filename
    mock_create.assert_called_once()
    assert mock_create.call_args[1]["filename"] == "my-folder/subfolder/file.txt"
    # Verify that storage upload was called with the relative path as filename
    mock_storage.assert_called_once()
    assert mock_storage.call_args[1]["filename"] == "my-folder/subfolder/file.txt"
    # Verify background ingestion task was enqueued
    mock_enqueue.assert_called_once()
    assert mock_enqueue.call_args[1]["filename"] == "my-folder/subfolder/file.txt"
