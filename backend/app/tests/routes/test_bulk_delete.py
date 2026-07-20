import pytest

def test_bulk_delete_unauthorized(client):
    response = client.post("/api/documents/bulk-delete", json={"document_ids": ["doc-1", "doc-2"]})
    assert response.status_code in (401, 403)

def test_bulk_delete_empty_payload(client, auth_headers):
    response = client.post(
        "/api/documents/bulk-delete",
        json={"document_ids": []},
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["deleted_count"] == 0
    assert data["deleted_ids"] == []

def test_bulk_delete_success(client, auth_headers):
    response = client.post(
        "/api/documents/bulk-delete",
        json={"document_ids": ["non-existent-doc-1", "non-existent-doc-2"]},
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert "deleted_count" in data
    assert "deleted_ids" in data
