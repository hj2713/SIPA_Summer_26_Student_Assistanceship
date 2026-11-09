import logging
from typing import Optional
from dataclasses import dataclass
from app.core.config import settings
from app.repositories import get_db_session

logger = logging.getLogger(__name__)

@dataclass
class ResolvedLLMCredentials:
    api_key: str
    provider: str
    model: Optional[str]
    base_url: Optional[str]
    key_level: str  # 'personal' | 'workspace'


def is_postgres_session(session) -> bool:
    if settings.DB_PROVIDER.lower() == "postgres":
        return True
    conn_obj = getattr(session, "conn", None)
    if conn_obj:
        conn_str = str(type(conn_obj)).lower()
        return "psycopg" in conn_str or "pg" in conn_str or hasattr(conn_obj, "pg_conn")
    return False


def resolve_llm_credentials(
    user_id: Optional[str],
    workspace_id: Optional[str],
    provider: str = "openai"
) -> ResolvedLLMCredentials:
    """
    Pure Bring-Your-Own-Key (BYOK) Resolution:
    1. User Personal Key: Checked from user_llm_credentials (encrypted at rest)
       if preference allows ('USE_PERSONAL_IF_AVAILABLE' or 'ALWAYS_PERSONAL').
    2. Workspace Shared Key: Checked from workspace_llm_credentials (encrypted at rest)
       if preference allows ('USE_PERSONAL_IF_AVAILABLE' or 'USE_WORKSPACE_ONLY').

    SECURITY / ARCHITECTURAL RULE:
    Zero server environment variable fallback! The backend must never fall back to
    host/developer environment keys (OPENAI_API_KEY, GEMINI_API_KEY, etc.).
    All credentials must be explicitly configured and encrypted in the database.
    If no valid key exists, the request fails with a clear user-facing error.
    """
    provider_clean = provider.strip().lower()
    
    with get_db_session() as session:
        user_row = session.users.get_by_id(user_id) if user_id else None
        key_preference = "USE_PERSONAL_IF_AVAILABLE"
        if user_row:
            if isinstance(user_row, dict):
                key_preference = user_row.get("llm_key_preference") or "USE_PERSONAL_IF_AVAILABLE"
            else:
                key_preference = getattr(user_row, "llm_key_preference", None) or "USE_PERSONAL_IF_AVAILABLE"

        # -------------------------------------------------------------
        # STAGE 1: Personal Key Override (from user_llm_credentials DB)
        # -------------------------------------------------------------
        if user_id and key_preference != "USE_WORKSPACE_ONLY":
            try:
                from app.core.llm_credentials import get_user_llm_credentials_for_provider
                user_cred = get_user_llm_credentials_for_provider(user_id, provider_clean)
                if user_cred and user_cred.api_key and user_cred.api_key.strip():
                    return ResolvedLLMCredentials(
                        api_key=user_cred.api_key.strip(),
                        provider=provider_clean,
                        model=user_cred.model,
                        base_url=user_cred.base_url,
                        key_level="personal"
                    )
            except Exception as e:
                logger.warning(f"Error checking user personal LLM key: {e}")

        # -------------------------------------------------------------
        # STAGE 2: Workspace Admin Shared Key (from workspace_llm_credentials DB)
        # -------------------------------------------------------------
        if workspace_id and key_preference != "ALWAYS_PERSONAL":
            try:
                ws_key = get_workspace_llm_credential(session, workspace_id, provider_clean)
                if ws_key and ws_key.get("api_key_encrypted"):
                    from app.core.llm_credentials import decrypt_api_key
                    decrypted = decrypt_api_key(ws_key["api_key_encrypted"])
                    if decrypted and decrypted.strip():
                        return ResolvedLLMCredentials(
                            api_key=decrypted.strip(),
                            provider=provider_clean,
                            model=ws_key.get("model"),
                            base_url=ws_key.get("base_url"),
                            key_level="workspace"
                        )
            except Exception as e:
                logger.warning(f"Error checking workspace LLM key: {e}")

    # No server environment fallback! Pure BYOK architecture.
    raise ValueError(
        f"No valid API key configured for provider '{provider_clean}'. "
        f"Please add your API key in Settings → Cost Tracking & BYOK Vault."
    )


def get_workspace_llm_credential(session, workspace_id: str, provider: str) -> Optional[dict]:
    """Helper to query workspace_llm_credentials table."""
    try:
        if hasattr(session, "conn") and session.conn:
            cursor = session.conn.cursor()
            if is_postgres_session(session):
                cursor.execute(
                    "SELECT id, workspace_id, provider, api_key_encrypted, model, base_url FROM workspace_llm_credentials WHERE workspace_id = %s AND provider = %s;",
                    (workspace_id, provider)
                )
            else:
                cursor.execute(
                    "SELECT id, workspace_id, provider, api_key_encrypted, model, base_url FROM workspace_llm_credentials WHERE workspace_id = ? AND provider = ?;",
                    (workspace_id, provider)
                )
            row = cursor.fetchone()
            if row:
                if isinstance(row, (list, tuple)):
                    return {
                        "id": row[0],
                        "workspace_id": row[1],
                        "provider": row[2],
                        "api_key_encrypted": row[3],
                        "model": row[4],
                        "base_url": row[5]
                    }
                return dict(row)
    except Exception as e:
        logger.warning(f"Error querying workspace_llm_credentials: {e}")
    return None
