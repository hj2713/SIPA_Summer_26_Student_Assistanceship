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


def test_legacy_credentials_migration(client):
    import uuid
    from app.tests.conftest import make_jwt
    legacy_user_id = str(uuid.uuid4())
    legacy_headers = {"Authorization": f"Bearer {make_jwt(legacy_user_id)}"}

    from app.core.database import get_db_conn
    from app.core.llm_credentials import encrypt_api_key

    with get_db_conn() as conn:
        conn.execute(
            "INSERT INTO users (id, email, password_hash, is_admin, can_add, can_delete, llm_provider, llm_api_key_encrypted, llm_model, llm_base_url) VALUES (?, ?, 'hash', 1, 1, 1, 'anthropic', ?, 'claude-opus-4.8', 'https://legacy.url')",
            (legacy_user_id, f"legacy_{legacy_user_id[:8]}@test.com", encrypt_api_key("legacy_anthropic_key"))
        )
        conn.commit()

    # GET credentials summary to trigger migration check
    res_get = client.get("/api/auth/llm-credentials", headers=legacy_headers)
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


def test_link_google_endpoint_success(client, auth_headers):
    response = client.post(
        "/api/auth/link-google",
        json={"google_email": "hj2713@columbia.edu"},
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["google_email"] == "hj2713@columbia.edu"
    assert "successfully linked" in data["message"]


def test_invite_and_remove_workspace_member(client):
    from app.tests.factories import create_test_user, create_test_workspace
    owner = create_test_user(email="workspace_owner@university.edu", is_admin=True)
    ws = create_test_workspace(name="Collaborative Lab", creator_user_id=owner["id"], creator_email=owner["email"])

    collab_email = "colleague_lab@university.edu"
    from app.tests.base import ALLOWED_TEST_IDS
    ALLOWED_TEST_IDS.add(collab_email)

    invite_res = client.post(
        f"/api/auth/workspaces/{ws['id']}/invite",
        json={"email": collab_email, "role": "admin"},
        headers=owner["headers"]
    )
    assert invite_res.status_code == 200
    invite_data = invite_res.json()
    assert invite_data["status"] == "success"
    assert invite_data["role"] == "admin"
    assert "invite_link" in invite_data
    assert collab_email in invite_data["invite_link"]

    # 2. List members and verify collaborator is listed
    members_res = client.get(f"/api/auth/workspaces/{ws['id']}/members", headers=owner["headers"])
    assert members_res.status_code == 200
    members = members_res.json()
    collab = next((m for m in members if m["email"] == collab_email), None)
    assert collab is not None
    assert collab["role"] == "Admin"

    # 3. Remove collaborator
    del_res = client.delete(f"/api/auth/workspaces/{ws['id']}/members/{collab_email}", headers=owner["headers"])
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "success"

    # 4. Verify removed
    members_res2 = client.get(f"/api/auth/workspaces/{ws['id']}/members", headers=owner["headers"])
    members2 = members_res2.json()
    assert not any(m["email"] == collab_email for m in members2)


def test_invitation_pending_and_accept_flow(client):
    from app.tests.factories import create_test_user, create_test_workspace
    owner = create_test_user(email="lab_owner@university.edu", is_admin=True)
    ws = create_test_workspace(name="Empirical Research Lab", creator_user_id=owner["id"], creator_email=owner["email"])

    collab = create_test_user(email="invited_researcher@university.edu")

    # 1. Owner invites collaborator
    invite_res = client.post(
        f"/api/auth/workspaces/{ws['id']}/invite",
        json={"email": collab["email"], "role": "member"},
        headers=owner["headers"]
    )
    assert invite_res.status_code == 200

    # 2. In owner's member view, collaborator is 'Pending Acceptance'
    members_res = client.get(f"/api/auth/workspaces/{ws['id']}/members", headers=owner["headers"])
    assert members_res.status_code == 200
    member_item = next((m for m in members_res.json() if m["email"] == collab["email"]), None)
    assert member_item is not None
    assert member_item["status"] == "Pending Acceptance"

    # 3. Collaborator does NOT have active access yet
    collab_workspaces = client.get("/api/auth/workspaces", headers=collab["headers"]).json()
    assert not any(w["id"] == ws["id"] for w in collab_workspaces)

    # 4. Collaborator checks pending invitations on-demand
    pending_res = client.get("/api/auth/invitations/pending", headers=collab["headers"])
    assert pending_res.status_code == 200
    pending_list = pending_res.json()
    assert any(p["workspace_id"] == ws["id"] for p in pending_list)

    # 5. Collaborator accepts invitation
    accept_res = client.post(f"/api/auth/workspaces/{ws['id']}/accept", headers=collab["headers"])
    assert accept_res.status_code == 200
    assert accept_res.json()["status"] == "success"

    # 6. Collaborator now has full active access to the workspace
    collab_workspaces_after = client.get("/api/auth/workspaces", headers=collab["headers"]).json()
    assert any(w["id"] == ws["id"] for w in collab_workspaces_after)

    # 7. Owner sees status as 'Active'
    members_after = client.get(f"/api/auth/workspaces/{ws['id']}/members", headers=owner["headers"]).json()
    member_after = next((m for m in members_after if m["email"] == collab["email"]), None)
    assert member_after is not None
    assert member_after["status"] == "Active"


