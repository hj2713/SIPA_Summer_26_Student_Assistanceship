import pytest
from unittest.mock import patch, AsyncMock, MagicMock

def test_verify_unauthorized(client):
    response = client.post(
        "/api/auth/llm-credentials/verify",
        json={"provider": "openai", "api_key": "test_key"}
    )
    assert response.status_code in (401, 403)

def test_verify_empty_key(client, auth_headers):
    response = client.post(
        "/api/auth/llm-credentials/verify",
        json={"provider": "openai", "api_key": ""},
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is False
    assert "empty" in data["error"]

def test_verify_openai_success(client, auth_headers):
    # Mock AsyncOpenAI
    mock_client = MagicMock()
    mock_client.chat = MagicMock()
    mock_client.chat.completions = MagicMock()
    mock_client.chat.completions.create = AsyncMock()
    
    mock_client.models = MagicMock()
    mock_models_res = MagicMock()
    mock_models_res.data = [
        MagicMock(id="gpt-4o"),
        MagicMock(id="gpt-4o-mini"),
        MagicMock(id="whisper-1"),
    ]
    mock_client.models.list = AsyncMock(return_value=mock_models_res)

    with patch("openai.AsyncOpenAI", return_value=mock_client):
        response = client.post(
            "/api/auth/llm-credentials/verify",
            json={"provider": "openai", "api_key": "valid_openai_key"},
            headers=auth_headers
        )
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "gpt-4o" in data["models"]
    assert "gpt-4o-mini" in data["models"]
    assert "whisper-1" not in data["models"]

def test_verify_google_success(client, auth_headers):
    # Mock genai Client
    mock_client = MagicMock()
    mock_client.aio = MagicMock()
    mock_client.aio.models = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock()
    
    mock_model_1 = MagicMock()
    mock_model_1.name = "models/gemini-2.5-flash"
    mock_model_2 = MagicMock()
    mock_model_2.name = "models/gemini-2.5-pro"
    mock_client.models = MagicMock()
    mock_client.models.list = MagicMock(return_value=[mock_model_1, mock_model_2])

    with patch("google.genai.Client", return_value=mock_client):
        response = client.post(
            "/api/auth/llm-credentials/verify",
            json={"provider": "google", "api_key": "valid_google_key"},
            headers=auth_headers
        )
        
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "gemini-2.5-flash" in data["models"]
    assert "gemini-2.5-pro" in data["models"]

def test_verify_anthropic_success(client, auth_headers):
    mock_client = MagicMock()
    mock_client.messages = MagicMock()
    mock_client.messages.create = AsyncMock()

    with patch("anthropic.AsyncAnthropic", return_value=mock_client):
        response = client.post(
            "/api/auth/llm-credentials/verify",
            json={"provider": "anthropic", "api_key": "valid_anthropic_key"},
            headers=auth_headers
        )
        
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["models"]) > 0
    assert "claude-3-5-sonnet-latest" in data["models"]

def test_verify_openrouter_success(client, auth_headers):
    mock_auth_response = MagicMock()
    mock_auth_response.status_code = 200
    
    mock_models_response = MagicMock()
    mock_models_response.status_code = 200
    mock_models_response.json = MagicMock(return_value={
        "data": [
            {"id": "deepseek/deepseek-chat"},
            {"id": "moonshotai/kimi-latest"},
            {"id": "openai/gpt-4o"}
        ]
    })

    class MockAsyncClient:
        async def __aenter__(self):
            return self
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass
        async def get(self, url, **kwargs):
            if "auth/key" in url:
                return mock_auth_response
            elif "models" in url:
                return mock_models_response
            raise ValueError(f"Unexpected URL: {url}")

    with patch("httpx.AsyncClient", return_value=MockAsyncClient()):
        # Test deepseek
        response = client.post(
            "/api/auth/llm-credentials/verify",
            json={"provider": "deepseek", "api_key": "valid_or_key"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["models"] == ["deepseek/deepseek-chat"]

        # Test kimi
        response2 = client.post(
            "/api/auth/llm-credentials/verify",
            json={"provider": "kimi", "api_key": "valid_or_key"},
            headers=auth_headers
        )
        assert response2.status_code == 200
        data2 = response2.json()
        assert data2["success"] is True
        assert data2["models"] == ["moonshotai/kimi-latest"]


def test_multiple_llm_credentials_flow(client, auth_headers):
    # 1. Save gemini credentials
    res1 = client.put(
        "/api/auth/llm-credentials",
        json={"provider": "gemini", "model": "gemini-3.5-flash", "api_key": "my_gemini_key"},
        headers=auth_headers
    )
    assert res1.status_code == 200
    
    # 2. Save openai credentials
    res2 = client.put(
        "/api/auth/llm-credentials",
        json={"provider": "openai", "model": "gpt-4o", "api_key": "my_openai_key"},
        headers=auth_headers
    )
    assert res2.status_code == 200

    # 3. GET credentials summary
    res_get = client.get("/api/auth/llm-credentials", headers=auth_headers)
    assert res_get.status_code == 200
    summary = res_get.json()
    
    assert summary["provider"] == "openai" # Active is last saved
    assert summary["model"] == "gpt-4o"
    
    saved_keys = summary["saved_keys"]
    gemini_key = next((k for k in saved_keys if k["provider"] == "gemini"), None)
    openai_key = next((k for k in saved_keys if k["provider"] == "openai"), None)
    
    assert gemini_key is not None
    assert gemini_key["has_api_key"] is True
    assert gemini_key["model"] == "gemini-3.5-flash"
    
    assert openai_key is not None
    assert openai_key["has_api_key"] is True
    assert openai_key["model"] == "gpt-4o"

    # 4. Delete gemini key
    res_del = client.put(
        "/api/auth/llm-credentials",
        json={"provider": "gemini", "clear_api_key": True},
        headers=auth_headers
    )
    assert res_del.status_code == 200
    
    res_get2 = client.get("/api/auth/llm-credentials", headers=auth_headers)
    summary2 = res_get2.json()
    gemini_key2 = next((k for k in summary2["saved_keys"] if k["provider"] == "gemini"), None)
    assert gemini_key2 is not None
    assert gemini_key2["has_api_key"] is False


def test_legacy_credentials_migration(client, auth_headers):
    user_id = "00000000-0000-0000-0000-000000000001"

    from app.core.database import get_db_conn
    from app.core.llm_credentials import encrypt_api_key

    # Manually delete any existing rows from user_llm_credentials for this user
    with get_db_conn() as conn:
        conn.execute("DELETE FROM user_llm_credentials WHERE user_id = ?", (user_id,))
        # Write legacy columns on users row
        conn.execute(
            "UPDATE users SET llm_provider = ?, llm_api_key_encrypted = ?, llm_model = ?, llm_base_url = ? WHERE id = ?",
            ("anthropic", encrypt_api_key("legacy_anthropic_key"), "claude-opus-4.8", "https://legacy.url", user_id)
        )
        conn.commit()

    # GET credentials summary to trigger migration check
    res_get = client.get("/api/auth/llm-credentials", headers=auth_headers)
    assert res_get.status_code == 200
    summary = res_get.json()

    assert summary["provider"] == "anthropic"
    assert summary["model"] == "claude-opus-4.8"
    assert summary["base_url"] == "https://legacy.url"
    assert summary["has_api_key"] is True

    anthropic_key = next((k for k in summary["saved_keys"] if k["provider"] == "anthropic"), None)
    assert anthropic_key is not None
    assert anthropic_key["has_api_key"] is True
    assert anthropic_key["model"] == "claude-opus-4.8"

