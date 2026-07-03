"""Application configuration via Pydantic Settings.

Reads from environment variables / .env file.
Access everywhere via: from app.core.config import settings
"""
import logging
import hashlib
import os
from pydantic_settings import BaseSettings, SettingsConfigDict

# Stable auto-generated secret derived from a machine-level path.
# This means the secret survives restarts but doesn't require explicit config.
_AUTO_JWT_SECRET = hashlib.sha256(
    ("rag-app-local-secret-" + os.path.expanduser("~")).encode()
).hexdigest()


logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Server
    PORT: int = 8000
    ENV: str = "development"
    CORS_ORIGINS: str = "http://localhost:5173"

    # Auth/JWT settings
    JWT_SECRET: str = _AUTO_JWT_SECRET  # Falls back to stable auto-generated secret

    # Database Settings
    DB_PROVIDER: str = "sqlite"  # 'sqlite' or 'postgres'
    DATABASE_URL: str = ""       # postgresql connection URI

    # Supabase settings (optional, for future cloud authentication / storage migrations)
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""


    # LLM provider selection
    # 'auto' picks OpenRouter if OPEN_ROUTER_API_KEY is set, else OpenAI.
    # Explicit values: 'openai', 'openrouter' (and future: 'anthropic', 'gemini').
    LLM_PROVIDER: str = "gemini"
    # When false, authenticated users must save their own API key in Settings.
    # This prevents accidental use of the deployment owner's API key in production.
    ALLOW_SERVER_LLM_FALLBACK: bool = True

    # OpenAI / OpenRouter credentials and model names
    OPENAI_API_KEY: str = ""
    OPEN_ROUTER_API_KEY: str = ""
    OPEN_ROUTER_MODEL_NAME: str = "openai/gpt-4o-mini"
    OPENAI_MODEL: str = "gpt-4.1-mini"
    OPENAI_VECTOR_STORE_ID: str = ""  # optional — enables file_search tool
    OPENAI_REQUEST_TIMEOUT_SECONDS: float = 180.0
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.1-flash-lite-preview"
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-3-5-sonnet-latest"

    # Tracing provider selection
    # 'auto' uses LangSmith when LANGSMITH_TRACING + LANGSMITH_API_KEY are set,
    # otherwise no-op. Explicit values: 'langsmith', 'none'.
    TRACING_PROVIDER: str = "auto"

    # LangSmith credentials (used when tracing provider is langsmith)
    LANGSMITH_TRACING: bool = False
    LANGSMITH_API_KEY: str = ""
    LANGSMITH_PROJECT: str = "agentic-rag-module-1"
    LANGSMITH_ENDPOINT: str = "https://api.smith.langchain.com"

    # Retrieval tuning (Module 6)
    # RETRIEVAL_CANDIDATE_COUNT: how many chunks the hybrid RPC fetches before
    #   reranking trims to RETRIEVAL_FINAL_COUNT. Fetch more candidates than you
    #   need so the reranker has a meaningful set to reorder.
    RETRIEVAL_CANDIDATE_COUNT: int = 20
    RETRIEVAL_FINAL_COUNT: int = 5

    # Reranking (Module 6 — optional, requires: pip install sentence-transformers)
    # Set ENABLE_RERANKING=true in .env to activate cross-encoder reranking.
    # The model is downloaded from HuggingFace on first use (~80 MB).
    ENABLE_RERANKING: bool = False
    RERANK_MODEL: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    RERANK_TOP_N: int = 5

    # Document extraction
    # Keep false on low-memory/free-tier deployments. Plain text, Markdown, and
    # HTML are decoded without Docling; PDF/DOCX require this to be enabled.
    ENABLE_DOCLING_EXTRACTION: bool = False

    @property
    def cors_origins_list(self) -> list[str]:
        origins = []
        for o in self.CORS_ORIGINS.split(","):
            clean = o.strip()
            if clean:
                origins.append(clean)
                if clean.endswith("/"):
                    origins.append(clean.rstrip("/"))
                else:
                    origins.append(clean + "/")
        return origins


    def warn_missing(self) -> None:
        """Log warnings for missing critical configuration."""
        if self.LANGSMITH_TRACING and not self.LANGSMITH_API_KEY:
            logger.warning(
                "LANGSMITH_TRACING=true but LANGSMITH_API_KEY is not set — "
                "traces will be silently dropped."
            )
        if self.ENV != "development" and self.JWT_SECRET == _AUTO_JWT_SECRET:
            logger.warning(
                "ENV=%s is using the auto-generated local JWT_SECRET. "
                "Set a stable, high-entropy JWT_SECRET before production deployment.",
                self.ENV,
            )
        if self.ENV != "development" and self.ALLOW_SERVER_LLM_FALLBACK:
            logger.warning(
                "ALLOW_SERVER_LLM_FALLBACK=true in ENV=%s. "
                "Users without saved LLM keys may use server-owned API keys.",
                self.ENV,
            )
        if not self.OPENAI_API_KEY and not self.OPEN_ROUTER_API_KEY and not self.GEMINI_API_KEY:
            logger.warning("No API keys set (OPENAI_API_KEY, OPEN_ROUTER_API_KEY, or GEMINI_API_KEY) — LLM calls will fail.")
        if self.ENABLE_RERANKING:
            logger.info(
                "Reranking enabled. Model: %s, Top-N: %d. "
                "Ensure sentence-transformers is installed.",
                self.RERANK_MODEL, self.RERANK_TOP_N,
            )
        if not self.ENABLE_DOCLING_EXTRACTION:
            logger.info(
                "Docling extraction is disabled. Text/Markdown/HTML uploads are supported; "
                "PDF/DOCX extraction requires ENABLE_DOCLING_EXTRACTION=true."
            )


settings = Settings()
