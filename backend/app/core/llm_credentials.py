"""Encrypted per-user LLM credential storage."""
from __future__ import annotations

import base64
import hashlib
from dataclasses import dataclass

from cryptography.fernet import Fernet, InvalidToken
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.database import get_db_conn


SUPPORTED_LLM_PROVIDERS = {"openai", "openrouter", "gemini"}


DEFAULT_MODEL_BY_PROVIDER = {
    "openai": settings.OPENAI_MODEL,
    "openrouter": settings.OPEN_ROUTER_MODEL_NAME,
    "gemini": settings.GEMINI_MODEL,
}


@dataclass(frozen=True)
class UserLLMCredentials:
    provider: str
    api_key: str
    model: str
    base_url: str | None = None


class LLMCredentialsResponse(BaseModel):
    provider: str = "gemini"
    model: str = DEFAULT_MODEL_BY_PROVIDER["gemini"]
    base_url: str = ""
    has_api_key: bool = False


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


def get_user_llm_credentials(user_id: str | None) -> UserLLMCredentials | None:
    if not user_id:
        return None

    from app.repositories import get_db_session
    with get_db_session() as session:
        row = session.users.get_by_id(user_id)

    if not row or not row.get("llm_api_key_encrypted"):
        return None

    provider = normalize_provider(row.get("llm_provider") or settings.LLM_PROVIDER or "gemini")
    model = (row.get("llm_model") or "").strip() or DEFAULT_MODEL_BY_PROVIDER[provider]
    base_url = (row.get("llm_base_url") or "").strip() or None
    api_key = decrypt_api_key(row["llm_api_key_encrypted"])

    return UserLLMCredentials(
        provider=provider,
        api_key=api_key,
        model=model,
        base_url=base_url,
    )


def get_user_llm_credentials_summary(user_id: str) -> LLMCredentialsResponse:
    from app.repositories import get_db_session
    with get_db_session() as session:
        row = session.users.get_by_id(user_id)

    if not row:
        return LLMCredentialsResponse()

    provider = row.get("llm_provider") or settings.LLM_PROVIDER or "gemini"
    provider = provider if provider in SUPPORTED_LLM_PROVIDERS else "gemini"
    return LLMCredentialsResponse(
        provider=provider,
        model=(row.get("llm_model") or "").strip() or DEFAULT_MODEL_BY_PROVIDER[provider],
        base_url=(row.get("llm_base_url") or "").strip(),
        has_api_key=bool(row.get("llm_api_key_encrypted")),
    )


def update_user_llm_credentials(user_id: str, payload: LLMCredentialsUpdate) -> LLMCredentialsResponse:
    provider = normalize_provider(payload.provider)
    model = (payload.model or "").strip() or DEFAULT_MODEL_BY_PROVIDER[provider]
    base_url = (payload.base_url or "").strip()

    encrypted_api_key: str | None = None
    should_update_key = payload.clear_api_key or bool(payload.api_key and payload.api_key.strip())
    if payload.api_key and payload.api_key.strip():
        encrypted_api_key = encrypt_api_key(payload.api_key.strip())

    updates = {
        "llm_provider": provider,
        "llm_model": model,
        "llm_base_url": base_url,
    }
    if should_update_key:
        updates["llm_api_key_encrypted"] = encrypted_api_key

    from app.repositories import get_db_session
    with get_db_session() as session:
        session.users.update(user_id, updates)

    return get_user_llm_credentials_summary(user_id)
