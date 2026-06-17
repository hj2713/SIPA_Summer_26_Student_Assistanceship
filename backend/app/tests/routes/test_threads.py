"""Tests for thread routes — auth guards and mocked Supabase CRUD."""
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Auth guard tests (no valid JWT → 401 / 403)
# ---------------------------------------------------------------------------

def test_list_threads_requires_auth(client):
    response = client.get("/api/threads")
    assert response.status_code in (401, 403)


def test_create_thread_requires_auth(client):
    response = client.post("/api/threads", json={"title": "Test"})
    assert response.status_code in (401, 403)


def test_get_thread_requires_auth(client):
    response = client.get("/api/threads/some-id")
    assert response.status_code in (401, 403)


def test_delete_thread_requires_auth(client):
    response = client.delete("/api/threads/some-id")
    assert response.status_code in (401, 403)


def test_rename_thread_requires_auth(client):
    response = client.patch("/api/threads/some-id", json={"title": "New"})
    assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Expired JWT → 401
# ---------------------------------------------------------------------------

def test_list_threads_expired_token(client, expired_headers):
    response = client.get("/api/threads", headers=expired_headers)
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Happy-path with mocked Supabase
# ---------------------------------------------------------------------------

_FAKE_THREAD = {
    "id": "00000000-0000-0000-0000-000000000099",
    "user_id": "00000000-0000-0000-0000-000000000001",
    "title": "Test thread",
    "provider": "openai",
    "created_at": "2024-01-01T00:00:00+00:00",
    "updated_at": "2024-01-01T00:00:00+00:00",
}


def _mock_execute(data):
    result = MagicMock()
    result.data = data
    return result


def test_list_threads_returns_list(client, auth_headers):
    with patch("app.routes.threads.get_user_client"), \
         patch("app.routes.threads.thread_service.list_threads", return_value=[]):
        response = client.get("/api/threads", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_get_thread_not_found(client, auth_headers):
    with patch("app.routes.threads.get_user_client"), \
         patch(
             "app.routes.threads.thread_service.get_thread_with_messages",
             return_value=None,
         ):
        response = client.get("/api/threads/missing-id", headers=auth_headers)
    assert response.status_code == 404


def test_delete_thread_not_found(client, auth_headers):
    with patch("app.routes.threads.get_user_client"), \
         patch("app.routes.threads.thread_service.delete_thread", return_value=False):
        response = client.delete("/api/threads/missing-id", headers=auth_headers)
    assert response.status_code == 404
