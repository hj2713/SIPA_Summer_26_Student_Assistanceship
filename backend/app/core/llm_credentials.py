"""Encrypted per-user LLM credential storage."""
from __future__ import annotations

import base64
import hashlib
import uuid
from dataclasses import dataclass

from cryptography.fernet import Fernet, InvalidToken
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.database import get_db_conn


SUPPORTED_LLM_PROVIDERS = {"openai", "openrouter", "gemini", "anthropic"}


DEFAULT_MODEL_BY_PROVIDER = {
    "openai": settings.OPENAI_MODEL,
    "openrouter": settings.OPEN_ROUTER_MODEL_NAME,
    "gemini": settings.GEMINI_MODEL,
    "anthropic": settings.ANTHROPIC_MODEL,
}


@dataclass(frozen=True)
class UserLLMCredentials:
    provider: str
    api_key: str
    model: str
    base_url: str | None = None


class SavedProviderKey(BaseModel):
    provider: str
    model: str
    base_url: str
    has_api_key: bool


class LLMCredentialsResponse(BaseModel):
    provider: str = "gemini"
    model: str = DEFAULT_MODEL_BY_PROVIDER["gemini"]
    base_url: str = ""
    has_api_key: bool = False
    saved_keys: list[SavedProviderKey] = Field(default_factory=list)


class LLMCredentialsUpdate(BaseModel):
    provider: str = Field(default="gemini")
    model: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    clear_api_key: bool = False


def _fernet() -> Fernet:
    digest = hashlib.sha256(settings.JWT_SECRET.encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_api_key(api_key: str) -> str:
    return _fernet().encrypt(api_key.encode("utf-8")).decode("utf-8")


def decrypt_api_key(encrypted_api_key: str) -> str:
    try:
        return _fernet().decrypt(encrypted_api_key.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Saved LLM API key cannot be decrypted with the current JWT_SECRET") from exc


def normalize_provider(provider: str) -> str:
    normalized = provider.strip().lower()
    if normalized not in SUPPORTED_LLM_PROVIDERS:
        raise ValueError(f"Unsupported LLM provider: {provider}")
    return normalized


def _query(sql: str) -> str:
    if settings.DB_PROVIDER == "postgres":
        return sql.replace("?", "%s")
    return sql


def _migrate_legacy_credentials(user_id: str) -> None:
    """Migrate legacy columns in `users` table to `user_llm_credentials` table."""
    try:
        with get_db_conn() as conn:
            # Check if user already has records in user_llm_credentials
            cursor = conn.cursor()
            cursor.execute(_query("SELECT COUNT(*) as count FROM user_llm_credentials WHERE user_id = ?"), (user_id,))
            row = cursor.fetchone()
            
            if row:
                count = row.get("count") if isinstance(row, dict) else row[0]
            else:
                count = 0
                
            if count > 0:
                return

            # Check if users table has legacy key
            cursor.execute(_query("SELECT llm_provider, llm_api_key_encrypted, llm_model, llm_base_url FROM users WHERE id = ?"), (user_id,))
            user_row = cursor.fetchone()
            if not user_row:
                return

            if isinstance(user_row, dict):
                provider = user_row.get("llm_provider") or "gemini"
                api_key_encrypted = user_row.get("llm_api_key_encrypted")
                model = user_row.get("llm_model") or DEFAULT_MODEL_BY_PROVIDER.get(provider, "")
                base_url = user_row.get("llm_base_url") or ""
            else:
                provider = user_row[0] or "gemini"
                api_key_encrypted = user_row[1]
                model = user_row[2] or DEFAULT_MODEL_BY_PROVIDER.get(provider, "")
                base_url = user_row[3] or ""

            if api_key_encrypted:
                cursor.execute(
                    _query("""
                    INSERT INTO user_llm_credentials (id, user_id, provider, api_key_encrypted, model, base_url)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """),
                    (str(uuid.uuid4()), user_id, provider, api_key_encrypted, model, base_url)
                )
                conn.commit()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Migration of legacy credentials failed: %s", e)


def get_user_llm_credentials(user_id: str | None) -> UserLLMCredentials | None:
    if not user_id:
        return None

    # Run migration check
    _migrate_legacy_credentials(user_id)

    # First, get active provider from users table
    from app.repositories import get_db_session
    with get_db_session() as session:
        user_row = session.users.get_by_id(user_id)

    if not user_row:
        return None

    active_provider = normalize_provider(user_row.get("llm_provider") or settings.LLM_PROVIDER or "gemini")

    # Fetch provider credentials from user_llm_credentials table
    from app.core.database import get_db_conn
    with get_db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            _query("SELECT api_key_encrypted, model, base_url FROM user_llm_credentials WHERE user_id = ? AND provider = ?"),
            (user_id, active_provider)
        )
        row = cursor.fetchone()

    if not row:
        # Fallback to user row columns directly if not found in user_llm_credentials
        api_key_encrypted = user_row.get("llm_api_key_encrypted")
        if not api_key_encrypted:
            return None
        model = (user_row.get("llm_model") or "").strip() or DEFAULT_MODEL_BY_PROVIDER.get(active_provider, "")
        base_url = (user_row.get("llm_base_url") or "").strip() or None
        api_key = decrypt_api_key(api_key_encrypted)
        return UserLLMCredentials(
            provider=active_provider,
            api_key=api_key,
            model=model,
            base_url=base_url,
        )

    if isinstance(row, dict):
        api_key_encrypted = row.get("api_key_encrypted")
        model = row.get("model")
        base_url = row.get("base_url")
    else:
        api_key_encrypted = row[0]
        model = row[1]
        base_url = row[2]

    if not api_key_encrypted:
        return None

    model = (model or "").strip() or DEFAULT_MODEL_BY_PROVIDER.get(active_provider, "")
    base_url = (base_url or "").strip() or None
    api_key = decrypt_api_key(api_key_encrypted)

    return UserLLMCredentials(
        provider=active_provider,
        api_key=api_key,
        model=model,
        base_url=base_url,
    )


def get_user_llm_credentials_for_provider(user_id: str, provider: str) -> UserLLMCredentials | None:
    """Fetch saved credentials for a *specific* provider, regardless of the user's active provider.

    Used by the three-provider routing in registry.py so that, e.g., an OpenRouter key can be
    fetched even when the user's currently active provider is 'gemini'.
    """
    if not user_id:
        return None

    provider = provider.strip().lower()
    if provider not in SUPPORTED_LLM_PROVIDERS:
        return None

    with get_db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            _query("SELECT api_key_encrypted, model, base_url FROM user_llm_credentials WHERE user_id = ? AND provider = ?"),
            (user_id, provider)
        )
        row = cursor.fetchone()

    if not row:
        return None

    if isinstance(row, dict):
        api_key_encrypted = row.get("api_key_encrypted")
        model = row.get("model") or DEFAULT_MODEL_BY_PROVIDER.get(provider, "")
        base_url = (row.get("base_url") or "").strip() or None
    else:
        api_key_encrypted = row[0]
        model = (row[1] or DEFAULT_MODEL_BY_PROVIDER.get(provider, "")).strip()
        base_url = (row[2] or "").strip() or None

    if not api_key_encrypted:
        return None

    try:
        api_key = decrypt_api_key(api_key_encrypted)
    except Exception:
        return None

    return UserLLMCredentials(provider=provider, api_key=api_key, model=model, base_url=base_url)


def get_user_llm_credentials_summary(user_id: str) -> LLMCredentialsResponse:
    # Run migration check
    _migrate_legacy_credentials(user_id)

    from app.repositories import get_db_session
    with get_db_session() as session:
        user_row = session.users.get_by_id(user_id)

    if not user_row:
        return LLMCredentialsResponse()

    # Active provider details
    active_provider = user_row.get("llm_provider") or settings.LLM_PROVIDER or "gemini"
    active_provider = active_provider if active_provider in SUPPORTED_LLM_PROVIDERS else "gemini"

    # Fetch all saved keys from user_llm_credentials
    saved_keys = []
    from app.core.database import get_db_conn
    with get_db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            _query("SELECT provider, model, base_url, api_key_encrypted FROM user_llm_credentials WHERE user_id = ?"),
            (user_id,)
        )
        rows = cursor.fetchall()

    for r in rows:
        if isinstance(r, dict):
            p = r.get("provider")
            m = r.get("model") or ""
            bu = r.get("base_url") or ""
            has_key = bool(r.get("api_key_encrypted"))
        else:
            p = r[0]
            m = r[1] or ""
            bu = r[2] or ""
            has_key = bool(r[3])
        if p in SUPPORTED_LLM_PROVIDERS:
            saved_keys.append(SavedProviderKey(
                provider=p,
                model=m,
                base_url=bu,
                has_api_key=has_key
            ))

    # Also check active provider info from user_llm_credentials
    active_model = DEFAULT_MODEL_BY_PROVIDER[active_provider]
    active_base_url = ""
    active_has_key = False

    for sk in saved_keys:
        if sk.provider == active_provider:
            active_model = sk.model
            active_base_url = sk.base_url
            active_has_key = sk.has_api_key
            break

    # If active provider wasn't in user_llm_credentials, check old columns as fallback
    if not active_has_key:
        active_has_key = bool(user_row.get("llm_api_key_encrypted"))
        if active_has_key:
            active_model = (user_row.get("llm_model") or "").strip() or DEFAULT_MODEL_BY_PROVIDER[active_provider]
            active_base_url = (user_row.get("llm_base_url") or "").strip()

    return LLMCredentialsResponse(
        provider=active_provider,
        model=active_model,
        base_url=active_base_url,
        has_api_key=active_has_key,
        saved_keys=saved_keys
    )


def update_user_llm_credentials(user_id: str, payload: LLMCredentialsUpdate) -> LLMCredentialsResponse:
    provider = normalize_provider(payload.provider)
    model = (payload.model or "").strip() or DEFAULT_MODEL_BY_PROVIDER[provider]
    base_url = (payload.base_url or "").strip()

    # 1. Update/Upsert the credentials in `user_llm_credentials` table
    with get_db_conn() as conn:
        cursor = conn.cursor()
        
        # Check if row exists
        cursor.execute(
            _query("SELECT id, api_key_encrypted FROM user_llm_credentials WHERE user_id = ? AND provider = ?"),
            (user_id, provider)
        )
        existing = cursor.fetchone()

        encrypted_api_key = None
        if payload.api_key and payload.api_key.strip():
            encrypted_api_key = encrypt_api_key(payload.api_key.strip())

        if existing:
            if isinstance(existing, dict):
                row_id = existing.get("id")
                old_key = existing.get("api_key_encrypted")
            else:
                row_id = existing[0]
                old_key = existing[1]

            # Decide on key update
            final_key = encrypted_api_key
            if not payload.clear_api_key and not (payload.api_key and payload.api_key.strip()):
                final_key = old_key

            cursor.execute(
                _query("""
                UPDATE user_llm_credentials
                SET model = ?, base_url = ?, api_key_encrypted = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """),
                (model, base_url, final_key, row_id)
            )
        else:
            cursor.execute(
                _query("""
                INSERT INTO user_llm_credentials (id, user_id, provider, api_key_encrypted, model, base_url)
                VALUES (?, ?, ?, ?, ?, ?)
                """),
                (str(uuid.uuid4()), user_id, provider, encrypted_api_key, model, base_url)
            )
        conn.commit()

    # 2. Update active provider in users table
    from app.repositories import get_db_session
    with get_db_session() as session:
        # Get final encrypted key for active provider to copy to users row
        with get_db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                _query("SELECT api_key_encrypted FROM user_llm_credentials WHERE user_id = ? AND provider = ?"),
                (user_id, provider)
            )
            key_row = cursor.fetchone()
            if key_row:
                active_key = key_row.get("api_key_encrypted") if isinstance(key_row, dict) else key_row[0]
            else:
                active_key = None

        session.users.update(user_id, {
            "llm_provider": provider,
            "llm_model": model,
            "llm_base_url": base_url,
            "llm_api_key_encrypted": active_key
        })

    return get_user_llm_credentials_summary(user_id)

