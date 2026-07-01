import pytest
import json

def test_create_evaluation_campaign_requires_auth(client):
    response = client.post("/api/dashboards", json={
        "name": "Test multi model",
        "prompt": "Extract delegation",
        "model": "gemini-3.1-flash-lite,gpt-4o-mini",
        "dashboard_type": "model_comparison"
    })
    assert response.status_code in (401, 403)

def test_create_evaluation_campaign_happy_path(client, auth_headers):
    # Mock schema generation to avoid API calls during test
    from unittest.mock import AsyncMock, patch
    with patch("app.routes.dashboards.generate_schema_and_description", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = {
            "description": "Test campaign description",
            "schema": [{"name": "delegate_law", "type": "boolean", "description": "Is law delegating"}]
        }
        response = client.post("/api/dashboards", json={
            "name": "Test Multi-Model Run",
            "prompt": "Find delegation",
            "model": "gemini-3.1-flash-lite,gpt-4o-mini",
            "dashboard_type": "model_comparison",
            "token_limit": 3000000
        }, headers=auth_headers)
        
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test Multi-Model Run"
        assert data["dashboard_type"] == "model_comparison"
        assert data["model"] == "gemini-3.1-flash-lite,gpt-4o-mini"
        assert data["token_limit"] == 3000000

def test_raise_token_limit_happy_path(client, auth_headers):
    # First create a dashboard
    from unittest.mock import AsyncMock, patch
    with patch("app.routes.dashboards.generate_schema_and_description", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = {
            "description": "Test",
            "schema": []
        }
        res = client.post("/api/dashboards", json={
            "name": "Test Limit Raise",
            "prompt": "Find delegation",
            "model": "gemini-3.1-flash-lite,gpt-4o-mini",
            "dashboard_type": "model_comparison",
            "token_limit": 1000000
        }, headers=auth_headers)
        dashboard_id = res.json()["id"]

    # Raise token limit
    with patch("app.services.campaign_service.campaign_service.retry_failed_documents") as mock_retry:
        mock_retry.return_value = []
        response = client.post(f"/api/dashboards/{dashboard_id}/raise-token-limit", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["new_limit"] == 3500000
        mock_retry.assert_called_once()


def test_add_model_to_campaign_happy_path(client, auth_headers):
    from unittest.mock import AsyncMock, patch
    with patch("app.routes.dashboards.generate_schema_and_description", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = {
            "description": "Test",
            "schema": []
        }
        res = client.post("/api/dashboards", json={
            "name": "Test Add Model",
            "prompt": "Find delegation",
            "model": "gemini-3.1-flash-lite",
            "dashboard_type": "model_comparison",
            "token_limit": 1000000
        }, headers=auth_headers)
        dashboard_id = res.json()["id"]

    with patch("app.services.campaign_service.campaign_service.retry_failed_documents") as mock_retry:
        mock_retry.return_value = ["doc1", "doc2"]
        response = client.post(f"/api/dashboards/{dashboard_id}/add-model?model=gpt-4o-mini", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "gpt-4o-mini" in data["model"]
        assert "gemini-3.1-flash-lite" in data["model"]
        assert "queued 2 documents" in data["message"]
        mock_retry.assert_called_once_with(dashboard_id, '00000000-0000-0000-0000-000000000001', payload=None, retry_model="gpt-4o-mini")

