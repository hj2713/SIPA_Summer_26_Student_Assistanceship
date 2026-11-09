import pytest
from app.core.llm_resolver import resolve_llm_credentials
from app.core.llm_credentials import encrypt_api_key
from app.repositories import get_db_session

def test_resolve_personal_key_override():
    """Test USE_PERSONAL_IF_AVAILABLE returns user's personal key when present."""
    mock_user_id = "test-user-personal-001"
    mock_ws_id = "test-ws-001"
    
    with get_db_session() as session:
        cursor = session.conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO workspaces (id, name) VALUES (?, ?);", (mock_ws_id, mock_ws_id))
        cursor.execute("INSERT OR REPLACE INTO users (id, email, password_hash, llm_key_preference) VALUES (?, ?, ?, ?);",
                       (mock_user_id, "user1@test.com", "mock_hash", "USE_PERSONAL_IF_AVAILABLE"))
        
        # Insert user personal key (encrypted)
        encrypted_personal = encrypt_api_key("sk-personal-user-key-12345")
        cursor.execute(
            """INSERT OR REPLACE INTO user_llm_credentials 
               (id, user_id, provider, api_key_encrypted)
               VALUES (?, ?, ?, ?);""",
            ("cred-1", mock_user_id, "openai", encrypted_personal)
        )
        
        # Insert workspace key (encrypted)
        encrypted_ws = encrypt_api_key("sk-workspace-shared-key-99999")
        cursor.execute(
            """INSERT OR REPLACE INTO workspace_llm_credentials
               (id, workspace_id, provider, api_key_encrypted)
               VALUES (?, ?, ?, ?);""",
            ("ws-cred-1", mock_ws_id, "openai", encrypted_ws)
        )
        session.conn.commit()

    resolved = resolve_llm_credentials(mock_user_id, mock_ws_id, provider="openai")
    assert resolved.key_level == "personal"
    assert resolved.api_key == "sk-personal-user-key-12345"
    assert resolved.provider == "openai"


def test_resolve_fallback_to_workspace_key():
    """When user has no personal key, falls back to workspace key."""
    mock_user_id = "test-user-no-key-002"
    mock_ws_id = "test-ws-002"
    
    with get_db_session() as session:
        cursor = session.conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO workspaces (id, name) VALUES (?, ?);", (mock_ws_id, mock_ws_id))
        cursor.execute("INSERT OR REPLACE INTO users (id, email, password_hash, llm_key_preference) VALUES (?, ?, ?, ?);",
                       (mock_user_id, "user2@test.com", "mock_hash", "USE_PERSONAL_IF_AVAILABLE"))
        
        encrypted_ws = encrypt_api_key("sk-workspace-fallback-key-777")
        cursor.execute(
            """INSERT OR REPLACE INTO workspace_llm_credentials
               (id, workspace_id, provider, api_key_encrypted)
               VALUES (?, ?, ?, ?);""",
            ("ws-cred-2", mock_ws_id, "openai", encrypted_ws)
        )
        session.conn.commit()

    resolved = resolve_llm_credentials(mock_user_id, mock_ws_id, provider="openai")
    assert resolved.key_level == "workspace"
    assert resolved.api_key == "sk-workspace-fallback-key-777"


def test_resolve_use_workspace_only_ignores_personal():
    """USE_WORKSPACE_ONLY preference must ignore personal key even if one is configured."""
    mock_user_id = "test-user-ws-only-003"
    mock_ws_id = "test-ws-003"
    
    with get_db_session() as session:
        cursor = session.conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO workspaces (id, name) VALUES (?, ?);", (mock_ws_id, mock_ws_id))
        cursor.execute("INSERT OR REPLACE INTO users (id, email, password_hash, llm_key_preference) VALUES (?, ?, ?, ?);",
                       (mock_user_id, "user3@test.com", "mock_hash", "USE_WORKSPACE_ONLY"))
        
        encrypted_personal = encrypt_api_key("sk-personal-ignored-111")
        cursor.execute(
            """INSERT OR REPLACE INTO user_llm_credentials 
               (id, user_id, provider, api_key_encrypted)
               VALUES (?, ?, ?, ?);""",
            ("cred-3", mock_user_id, "openai", encrypted_personal)
        )
        
        encrypted_ws = encrypt_api_key("sk-workspace-enforced-222")
        cursor.execute(
            """INSERT OR REPLACE INTO workspace_llm_credentials
               (id, workspace_id, provider, api_key_encrypted)
               VALUES (?, ?, ?, ?);""",
            ("ws-cred-3", mock_ws_id, "openai", encrypted_ws)
        )
        session.conn.commit()

    resolved = resolve_llm_credentials(mock_user_id, mock_ws_id, provider="openai")
    assert resolved.key_level == "workspace"
    assert resolved.api_key == "sk-workspace-enforced-222"


def test_resolve_always_personal_skips_workspace():
    """ALWAYS_PERSONAL skips workspace key even if personal key is missing (must fail without fallback)."""
    mock_user_id = "test-user-always-personal-004"
    mock_ws_id = "test-ws-004"
    
    with get_db_session() as session:
        cursor = session.conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO workspaces (id, name) VALUES (?, ?);", (mock_ws_id, mock_ws_id))
        cursor.execute("INSERT OR REPLACE INTO users (id, email, password_hash, llm_key_preference) VALUES (?, ?, ?, ?);",
                       (mock_user_id, "user4@test.com", "mock_hash", "ALWAYS_PERSONAL"))
        
        # Only workspace key exists
        encrypted_ws = encrypt_api_key("sk-workspace-not-allowed")
        cursor.execute(
            """INSERT OR REPLACE INTO workspace_llm_credentials
               (id, workspace_id, provider, api_key_encrypted)
               VALUES (?, ?, ?, ?);""",
            ("ws-cred-4", mock_ws_id, "openai", encrypted_ws)
        )
        session.conn.commit()

    # Must raise ValueError because personal key is required, workspace is skipped, and no system fallback exists
    with pytest.raises(ValueError, match="No valid API key configured for provider 'openai'"):
        resolve_llm_credentials(mock_user_id, mock_ws_id, provider="openai")


def test_resolve_fails_when_no_credentials_configured():
    """Verify that when no keys exist in the database, it fails explicitly and does NOT touch system environment."""
    mock_user_id = "test-user-no-keys-005"
    mock_ws_id = "test-ws-005"
    
    with get_db_session() as session:
        cursor = session.conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO workspaces (id, name) VALUES (?, ?);", (mock_ws_id, mock_ws_id))
        cursor.execute("INSERT OR REPLACE INTO users (id, email, password_hash, llm_key_preference) VALUES (?, ?, ?, ?);",
                       (mock_user_id, "user5@test.com", "mock_hash", "USE_PERSONAL_IF_AVAILABLE"))
        session.conn.commit()

    with pytest.raises(ValueError, match="No valid API key configured for provider 'openai'"):
        resolve_llm_credentials(mock_user_id, mock_ws_id, provider="openai")


def test_key_preference_api_endpoints(client, auth_headers):
    """Test GET and PUT /api/auth/user/key-preference."""
    # 1. Get initial preference
    res = client.get("/api/auth/user/key-preference", headers=auth_headers)
    assert res.status_code == 200
    assert "preference" in res.json()
    
    # 2. Update to USE_WORKSPACE_ONLY
    put_res = client.put(
        "/api/auth/user/key-preference",
        json={"preference": "USE_WORKSPACE_ONLY"},
        headers=auth_headers
    )
    assert put_res.status_code == 200
    assert put_res.json()["preference"] == "USE_WORKSPACE_ONLY"

    # 3. Verify get returns new value
    verify_res = client.get("/api/auth/user/key-preference", headers=auth_headers)
    assert verify_res.status_code == 200
    assert verify_res.json()["preference"] == "USE_WORKSPACE_ONLY"

    # 4. Invalid preference validation returns 400
    invalid_res = client.put(
        "/api/auth/user/key-preference",
        json={"preference": "INVALID_MODE"},
        headers=auth_headers
    )
    assert invalid_res.status_code == 400
