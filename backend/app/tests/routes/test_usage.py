import pytest

def test_usage_stats_requires_auth(client):
    response = client.get("/api/usage/stats")
    assert response.status_code in (401, 403)

def test_usage_stats_expired_token(client, expired_headers):
    response = client.get("/api/usage/stats", headers=expired_headers)
    assert response.status_code == 401

def test_usage_stats_happy_path(client, auth_headers):
    response = client.get("/api/usage/stats?timeframe=last_day", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert "breakdown" in data
    assert "timeline" in data
    assert "total_cost" in data["summary"]
    assert "input_tokens" in data["summary"]
    assert "output_tokens" in data["summary"]
