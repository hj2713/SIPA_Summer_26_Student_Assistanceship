"""LLMService: the single entry point used everywhere in the app.

`get_llm()` returns a process-wide singleton. The concrete provider is
chosen at first call based on `settings`.

Routing rules (hard rule, no exceptions):
  - model starts with "gemini-"         → Google Gemini API (GEMINI_API_KEY)
  - model starts with "claude-"         → Anthropic API (ANTHROPIC_API_KEY)
  - model starts with "gpt-" / "o1-" / "o3-" / "o4-" → OpenAI API (OPENAI_API_KEY)
  - everything else (deepseek, kimi, qwen, llama, etc.) → OpenRouter API (OPEN_ROUTER_API_KEY)

When per-user saved keys are present, the matching key for each provider
is fetched from `user_llm_credentials` instead of the server `.env`.
"""
from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Sequence

from pydantic import BaseModel

from app.core.config import settings
from app.core.llm_credentials import UserLLMCredentials, get_user_llm_credentials
from app.core.request_context import get_current_user_id
from app.llm.base import LLMProvider
from app.llm.tracing import get_tracer
from app.llm.types import LLMChunk, LLMMessage, LLMTool

logger = logging.getLogger(__name__)


from typing import Any
import uuid
from app.llm.types import LLMUsage

# ---------------------------------------------------------------------------
# Model pricing matrix per 1M tokens: (input cost per 1M, output cost per 1M)
# ---------------------------------------------------------------------------
PRICING_MAP = {
    # 1. Google Gemini
    "gemini-3.1-pro": (2.00, 12.00),
    "gemini-3.5-flash": (1.50, 9.00),
    "gemini-3.1-flash-lite": (0.25, 1.50),
    "gemini-3-flash": (0.50, 3.00),
    "gemini-1.5-flash": (0.075, 0.30),
    "gemini-1.5-pro": (3.50, 10.50),
    "gemini-2.0-flash": (0.10, 0.40),
    "gemini-2.5-flash": (0.15, 0.60),
    "gemini-2.5-pro": (1.25, 10.00),

    # 2. OpenAI
    "gpt-5.5-pro": (30.00, 180.00),
    "gpt-5.5": (5.00, 30.00),
    "gpt-5.4": (2.50, 15.00),
    "gpt-5.4-mini": (0.75, 4.50),
    "gpt-5.4-nano": (0.20, 1.25),
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4-turbo": (10.00, 30.00),
    "o3-mini": (1.10, 4.40),
    "o4-mini": (1.10, 4.40),
    "o1-preview": (15.00, 60.00),
    "o1-mini": (3.00, 12.00),
    "o1": (15.00, 60.00),
    "o3": (10.00, 40.00),

    # 3. Anthropic Claude
    "claude-opus-4.8": (5.00, 25.00),
    "claude-sonnet-5": (3.00, 15.00),
    "claude-sonnet-4.6": (3.00, 15.00),
    "claude-sonnet-4-5": (3.00, 15.00),
    "claude-haiku-4.5": (1.00, 5.00),
    "claude-haiku-3-5": (0.80, 4.00),
    "claude-3-5-sonnet": (3.00, 15.00),
    "claude-3-5-haiku": (0.80, 4.00),
    "claude-3-opus": (15.00, 75.00),

    # 4. DeepSeek (via OpenRouter)
    "deepseek-v4-pro": (1.74, 3.48),
    "deepseek-v4-flash": (0.14, 0.28),
    "deepseek-r1": (0.55, 2.19),
    "deepseek-chat": (0.14, 0.28),
    "deepseek-v3": (0.28, 0.88),
    "deepseek-r1-0528": (0.55, 2.19),

    # 5. Kimi / Moonshot (via OpenRouter)
    "kimi-k2.7-code": (0.95, 4.00),
    "kimi-k2.6": (0.95, 4.00),
    "kimi-k2.5": (0.60, 3.00),
    "kimi-k2": (0.60, 3.00),
    "kimi": (0.95, 4.00),
    "moonshot": (0.95, 4.00),

    # 6. Meta Llama (via OpenRouter)
    "llama-3.3": (0.18, 0.60),
    "llama-3.1": (0.18, 0.60),
    "llama-4-maverick": (0.22, 0.88),
    "llama-4-scout": (0.18, 0.60),

    # 7. Qwen (via OpenRouter)
    "qwen3": (0.40, 1.60),
    "qwen2.5": (0.28, 0.88),
    "qwen-turbo": (0.14, 0.28),
    "qwq-32b": (0.15, 0.60),
    "qwen2-vl": (0.40, 1.20),
    # 8. Mistral (via OpenRouter)
    "mistral-large": (2.00, 6.00),
    "mistral-codestral": (0.30, 0.90),
    "mistral-nemo": (0.07, 0.07),
    # 9. Minimax (via OpenRouter)
    "minimax-01": (0.20, 0.20),
}


def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Calculate the cost of an LLM invocation using local pricing map."""
    model_lower = model.lower()
    # Strip openrouter namespace prefix like "deepseek/" → "deepseek-chat"
    if "/" in model_lower:
        model_lower = model_lower.split("/")[-1]
    for key, (in_p, out_p) in PRICING_MAP.items():
        if key in model_lower:
            return (input_tokens * (in_p / 1_000_000.0)) + (output_tokens * (out_p / 1_000_000.0))
    # Fallback to low-cost pricing
    return (input_tokens * (0.15 / 1_000_000.0)) + (output_tokens * (0.60 / 1_000_000.0))


def log_usage_to_db(
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    context: dict[str, Any] | None
) -> None:
    """Insert LLM invocation token counts and calculated cost into the local database."""
    from app.core.database import get_db_conn
    ctx = context or {}
    service = ctx.get("service", "unknown")
    campaign_id = ctx.get("campaign_id")
    thread_id = ctx.get("thread_id")
    cost = calculate_cost(model, input_tokens, output_tokens)

    try:
        with get_db_conn() as conn:
            query = """
                INSERT INTO llm_usage_logs (
                    id, provider, model, service, campaign_id, thread_id, input_tokens, output_tokens, calculated_cost
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """
            if settings.DB_PROVIDER == "postgres":
                query = query.replace("?", "%s")
                
            conn.execute(
                query,
                (
                    str(uuid.uuid4()),
                    provider,
                    model,
                    service,
                    campaign_id,
                    thread_id,
                    input_tokens,
                    output_tokens,
                    cost
                )
            )
            conn.commit()
    except Exception as e:
        logger.error("Failed to log LLM usage: %s", e)


# ---------------------------------------------------------------------------
# Provider routing table
# ---------------------------------------------------------------------------

# OpenRouter canonical model IDs for models that don't already carry a "/" prefix
_OPENROUTER_MODEL_MAP: dict[str, str] = {
    # OpenAI
    "gpt-4o-mini": "openai/gpt-4o-mini",
    "gpt-4o": "openai/gpt-4o",
    "gpt-4-turbo": "openai/gpt-4-turbo",
    "o1-preview": "openai/o1-preview",
    "o1-mini": "openai/o1-mini",
    "o1": "openai/o1",
    "o3-mini": "openai/o3-mini",
    "o4-mini": "openai/o4-mini",
    "o3": "openai/o3",
    "gpt-5.5-pro": "openai/gpt-5.5-pro",
    "gpt-5.5": "openai/gpt-5.5",
    "gpt-5.4": "openai/gpt-5.4",
    "gpt-5.4-mini": "openai/gpt-5.4-mini",
    "gpt-5.4-nano": "openai/gpt-5.4-nano",
    # Anthropic Claude
    "claude-opus-4.8": "anthropic/claude-opus-4.8",
    "claude-sonnet-5": "anthropic/claude-sonnet-5",
    "claude-sonnet-4.6": "anthropic/claude-sonnet-4.6",
    "claude-sonnet-4-5": "anthropic/claude-sonnet-4-5",
    "claude-haiku-4.5": "anthropic/claude-haiku-4.5",
    "claude-haiku-3-5": "anthropic/claude-3-5-haiku",
    "claude-3-5-sonnet": "anthropic/claude-3.5-sonnet",
    "claude-3-5-sonnet-latest": "anthropic/claude-3.5-sonnet",
    "claude-3-5-haiku": "anthropic/claude-3.5-haiku",
    "claude-3-5-haiku-latest": "anthropic/claude-3.5-haiku",
    "claude-3-opus": "anthropic/claude-3-opus",
    "claude-3-sonnet": "anthropic/claude-3-sonnet",
    "claude-3-haiku": "anthropic/claude-3-haiku",
    # DeepSeek
    "deepseek-chat": "deepseek/deepseek-chat",
    "deepseek-r1": "deepseek/deepseek-r1",
    "deepseek-r1-0528": "deepseek/deepseek-r1-0528",
    "deepseek-v3": "deepseek/deepseek-v3",
    "deepseek-v4-pro": "deepseek/deepseek-chat",
    "deepseek-v4-flash": "deepseek/deepseek-chat",
    # Kimi / Moonshot
    "kimi-k2.7-code": "moonshot/kimi-k2.7-code",
    "kimi-k2.6": "moonshot/kimi-k2.6",
    "kimi-k2.5": "moonshot/kimi-k2.5",
    "kimi-k2": "moonshot/kimi-k2",
    "kimi": "moonshot/kimi-k2.5",
    "moonshot": "moonshot/kimi-k2.5",
    # Meta Llama
    "llama-3.3-70b": "meta-llama/llama-3.3-70b-instruct",
    "llama-3.1-70b": "meta-llama/llama-3.1-70b-instruct",
    "llama-4-maverick": "meta-llama/llama-4-maverick",
    "llama-4-scout": "meta-llama/llama-4-scout",
    # Qwen
    "qwen3-235b": "qwen/qwen3-235b-a22b",
    "qwen3-30b": "qwen/qwen3-30b-a3b",
    "qwen2.5-72b": "qwen/qwen-2.5-72b-instruct",
    "qwq-32b": "qwen/qwq-32b",
    "qwen-turbo": "qwen/qwen-turbo",
    # Mistral
    "mistral-large": "mistralai/mistral-large",
    "mistral-codestral": "mistralai/codestral-2501",
    "mistral-nemo": "mistralai/mistral-nemo",
    "mistral": "mistralai/mistral-large",
    # Minimax
    "minimax-01": "minimax/minimax-01",
    "minimax": "minimax/minimax-01",
}


def _classify_model(model: str) -> str:
    """Return the provider name for any model name string."""
    m = model.lower().strip()
    # Already a namespaced OpenRouter ID (e.g. "deepseek/deepseek-chat")
    if "/" in m:
        return "openrouter"
    # Gemini family
    if m.startswith("gemini-"):
        return "gemini"
    # Everything else → OpenRouter
    return "openrouter"


def _resolve_openrouter_model(model: str) -> str:
    """Map a friendly model name to the canonical OpenRouter model ID."""
    # Already namespaced — pass through
    if "/" in model:
        return model
    resolved = _OPENROUTER_MODEL_MAP.get(model.lower())
    if resolved:
        return resolved
    # Best-effort: return as-is (OpenRouter accepts many aliases)
    logger.warning("No explicit OpenRouter mapping for model=%r — passing through as-is", model)
    return model


class LLMService:
    """Thin facade around a single `LLMProvider`.

    Kept deliberately small: just forwards to the provider. The value is
    that callers depend on this shape instead of any vendor SDK.
    """

    def __init__(self, provider: LLMProvider) -> None:
        self._provider = provider

    @property
    def provider(self) -> LLMProvider:
        return self._provider

    @property
    def provider_name(self) -> str:
        return self._provider.name

    @property
    def model(self) -> str:
        return self._provider.model

    async def stream_chat(
        self,
        messages: Sequence[LLMMessage],
        *,
        tools: Sequence[LLMTool] = (),
        force_tool: str | None = None,
        log_context: dict[str, Any] | None = None,
    ) -> AsyncIterator[LLMChunk]:
        captured_usage = None
        async for chunk in self._provider.stream_chat(messages, tools=tools, force_tool=force_tool):
            if chunk.usage is not None:
                captured_usage = chunk.usage
            yield chunk

        if captured_usage:
            log_usage_to_db(
                provider=self.provider_name,
                model=self.model,
                input_tokens=captured_usage.input_tokens,
                output_tokens=captured_usage.output_tokens,
                context=log_context,
            )

    async def parse_structured(
        self,
        messages: Sequence[LLMMessage],
        schema: type[BaseModel],
        log_context: dict[str, Any] | None = None,
    ) -> BaseModel:
        parsed_val, usage = await self._provider.parse_structured(messages, schema)
        if usage:
            if log_context and "usage_accumulator" in log_context:
                try:
                    log_context["usage_accumulator"].append(usage)
                except Exception:
                    pass
            log_usage_to_db(
                provider=self.provider_name,
                model=self.model,
                input_tokens=usage.input_tokens,
                output_tokens=usage.output_tokens,
                context=log_context,
            )
        return parsed_val


_llm_singleton: LLMService | None = None


def get_llm() -> LLMService:
    """Return the process-wide `LLMService` singleton, building it on first call."""
    credentials = _get_request_llm_credentials()
    if credentials:
        return _build_user_llm(credentials)
    _raise_if_server_fallback_disabled()

    global _llm_singleton
    if _llm_singleton is None:
        _llm_singleton = _build_llm()
    return _llm_singleton


def get_llm_for_model(model_name: str | None = None) -> LLMService:
    """Get an LLMService for a specific model name using provider-aware routing.

    Routing (hard rule, in order):
      1. model starts with "gemini-"              → Gemini
      2. model starts with "claude-"              → Anthropic
      3. model starts with "gpt-" / "o1-" / etc. → OpenAI
      4. everything else                          → OpenRouter

    API keys come from (in preference order):
      1. Per-user saved keys in `user_llm_credentials`
      2. Server .env keys (GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, OPEN_ROUTER_API_KEY)
    """
    if not model_name:
        return get_llm()

    normalized_model_name = model_name.strip()
    if "," in normalized_model_name:
        primary_model_name = normalized_model_name.split(",", 1)[0].strip()
        logger.info(
            "Received multi-model string %r for single-model LLM selection; using primary model %r",
            model_name,
            primary_model_name,
        )
        normalized_model_name = primary_model_name

    provider = _classify_model(normalized_model_name)

    # ── 1. Try per-user saved keys first ────────────────────────────────────
    user_creds = _get_request_llm_credentials()
    if user_creds:
        return _build_service_for_provider(provider, normalized_model_name, user_creds=user_creds)

    _raise_if_server_fallback_disabled()
    # ── 2. Fall back to server .env keys ────────────────────────────────────
    return _build_service_for_provider(provider, normalized_model_name, user_creds=None)


def _build_service_for_provider(
    provider: str,
    model_name: str,
    *,
    user_creds: UserLLMCredentials | None,
) -> LLMService:
    """Build the correct LLMService given a classified provider and optional user key store."""
    tracer = get_tracer()

    if provider == "gemini":
        api_key = _pick_key("gemini", user_creds, settings.GEMINI_API_KEY)
        if not api_key:
            raise ValueError(
                f"No Gemini API key found for model '{model_name}'. "
                "Add one in Settings → API Keys → Google Gemini."
            )
        from app.llm.providers.gemini_provider import GeminiProvider
        llm_provider: LLMProvider = GeminiProvider(api_key=api_key, model=model_name)
        return LLMService(llm_provider)

    # Route all other providers via OpenRouter
    api_key = _pick_key("openrouter", user_creds, settings.OPEN_ROUTER_API_KEY)
    if not api_key:
        # Fall back to provider-specific keys if no openrouter key was set
        if provider == "openai":
            api_key = _pick_key("openai", user_creds, settings.OPENAI_API_KEY)
        elif provider == "anthropic":
            api_key = _pick_key("anthropic", user_creds, settings.ANTHROPIC_API_KEY)

    if not api_key:
        raise ValueError(
            f"No OpenRouter API key found for model '{model_name}'. "
            "Add one in Settings → API Keys → OpenRouter. "
            "All non-Gemini models (including GPT and Claude models) route via OpenRouter."
        )
    openrouter_model = _resolve_openrouter_model(model_name)
    from app.llm.providers.openai_provider import OpenAIProvider
    llm_provider = OpenAIProvider(
        api_key=api_key,
        model=openrouter_model,
        base_url="https://openrouter.ai/api/v1",
        default_headers={
            "HTTP-Referer": "http://localhost:8000",
            "X-Title": "Law Delegation Research",
        },
        tracer=tracer,
        name="openrouter",
    )
    return LLMService(llm_provider)


def _pick_key(
    provider: str,
    user_creds: UserLLMCredentials | None,
    server_env_key: str | None,
) -> str | None:
    """Return the best API key for `provider`.

    Priority: per-user saved key for that provider → server .env key.
    The user's *active* provider key only wins when it matches the target provider.
    """
    if user_creds:
        # Try to get the provider-specific key from the user's saved key store
        from app.core.llm_credentials import get_user_llm_credentials_for_provider
        user_id = get_current_user_id()
        if user_id:
            try:
                creds = get_user_llm_credentials_for_provider(user_id, provider)
                if creds and creds.api_key:
                    return creds.api_key
            except Exception:
                pass
        # Fall through to active-provider key only if it matches
        if user_creds.provider.lower() == provider and user_creds.api_key:
            return user_creds.api_key

    return server_env_key or None


def reset_llm() -> None:
    """Clear the singleton. Intended for tests that swap providers."""
    global _llm_singleton
    _llm_singleton = None


def _get_request_llm_credentials() -> UserLLMCredentials | None:
    user_id = get_current_user_id()
    if not user_id:
        return None
    try:
        return get_user_llm_credentials(user_id)
    except Exception as exc:
        logger.exception("Failed to load user LLM credentials for user %s", user_id)
        raise ValueError("Could not load your saved LLM credentials. Check Settings or contact an administrator.") from exc


def _raise_if_server_fallback_disabled() -> None:
    user_id = get_current_user_id()
    if user_id and not settings.ALLOW_SERVER_LLM_FALLBACK:
        raise ValueError("No LLM API key is configured for this user. Add one in Settings.")


def _build_user_llm(
    credentials: UserLLMCredentials,
    *,
    model_name: str | None = None,
) -> LLMService:
    """Build an LLM service using the current user's *active* saved provider credentials.
    
    Note: this is only called for the default (no model override) path.
    For model overrides (multi-model evaluation), use get_llm_for_model() directly.
    """
    tracer = get_tracer()
    provider_name = credentials.provider.lower()
    model = model_name or credentials.model

    if provider_name == "gemini":
        from app.llm.providers.gemini_provider import GeminiProvider
        provider: LLMProvider = GeminiProvider(
            api_key=credentials.api_key,
            model=model,
        )
        return LLMService(provider)

    # Route all other user credentials to OpenRouter
    openrouter_model = _resolve_openrouter_model(model)
    from app.llm.providers.openai_provider import OpenAIProvider
    provider = OpenAIProvider(
        api_key=credentials.api_key,
        model=openrouter_model,
        base_url=credentials.base_url or "https://openrouter.ai/api/v1",
        default_headers={
            "HTTP-Referer": "http://localhost:8000",
            "X-Title": "Law Delegation Research",
        },
        tracer=tracer,
        name="openrouter",
    )
    return LLMService(provider)


def _build_llm() -> LLMService:
    """Pick a provider based on settings and wrap it in an `LLMService`."""
    tracer = get_tracer()
    provider_name = (settings.LLM_PROVIDER or "auto").lower()

    if provider_name == "gemini" or (provider_name == "auto" and settings.GEMINI_API_KEY):
        from app.llm.providers.gemini_provider import GeminiProvider
        provider = GeminiProvider(
            api_key=settings.GEMINI_API_KEY,
            model=settings.GEMINI_MODEL,
        )
        logger.info("LLMService initialized: gemini (model=%s)", provider.model)
    else:
        # Route all other providers via OpenRouter
        api_key = settings.OPEN_ROUTER_API_KEY
        if not api_key:
            # Fall back to other keys for backward compatibility
            if provider_name == "openai":
                api_key = settings.OPENAI_API_KEY
            elif provider_name == "anthropic":
                api_key = settings.ANTHROPIC_API_KEY
        
        if not api_key:
            raise ValueError(
                "No OpenRouter API key found. "
                "All non-Gemini models route via OpenRouter. "
                "Please configure OPEN_ROUTER_API_KEY in your .env file."
            )
        
        raw_model = settings.OPEN_ROUTER_MODEL_NAME
        if provider_name == "openai" and settings.OPENAI_MODEL:
            raw_model = settings.OPENAI_MODEL
        elif provider_name == "anthropic" and settings.ANTHROPIC_MODEL:
            raw_model = settings.ANTHROPIC_MODEL
            
        model = _resolve_openrouter_model(raw_model)
        
        from app.llm.providers.openai_provider import OpenAIProvider
        provider = OpenAIProvider(
            api_key=api_key,
            model=model,
            base_url="https://openrouter.ai/api/v1",
            default_headers={
                "HTTP-Referer": "http://localhost:8000",
                "X-Title": "Law Delegation Research",
            },
            tracer=tracer,
            name="openrouter",
        )
        logger.info("LLMService initialized: openrouter (model=%s)", provider.model)

    return LLMService(provider)
