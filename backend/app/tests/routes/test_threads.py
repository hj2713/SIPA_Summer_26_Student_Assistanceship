"""Tests for thread routes with auth guards and mocked local client CRUD."""
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


def test_get_thread_not_found(client, auth_headers):
    with patch("app.routes.threads.get_user_client"), \
         patch(
             "app.routes.threads.thread_service.get_thread_with_messages",
             return_value=None,
         ):
        response = client.get("/api/threads/missing-id", headers=auth_headers)
    assert response.status_code == 404


def test_get_campaign_thread_requires_auth(client):
    response = client.get("/api/threads/campaign/some-camp-id")
    assert response.status_code in (401, 403)


def test_get_campaign_thread_not_found(client, auth_headers):
    with patch("app.routes.threads.get_user_client"), \
         patch("app.routes.threads.thread_service.get_latest_thread_for_campaign", return_value=None):
        response = client.get("/api/threads/campaign/some-camp-id", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() is None
