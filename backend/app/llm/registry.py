"""LLMService: the single entry point used everywhere in the app.

`get_llm()` returns a process-wide singleton. The concrete provider is
chosen at first call based on `settings`. To swap providers, set
`LLM_PROVIDER` in the environment (or rely on the auto-detect: OpenRouter
key wins over the direct OpenAI key).
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

# Model pricing matrix per 1M tokens: (input cost per 1M, output cost per 1M)
PRICING_MAP = {
    # 1. Google Gemini (Latest Top Models)
    "gemini-3.1-pro": (2.00, 12.00),
    "gemini-3.5-flash": (1.50, 9.00),
    "gemini-3.1-flash-lite": (0.25, 1.50),
    "gemini-3-flash": (0.50, 3.00),
    
    # 2. OpenAI (Latest Top Models)
    "gpt-5.5-pro": (30.00, 180.00),
    "gpt-5.5": (5.00, 30.00),
    "gpt-5.4": (2.50, 15.00),
    "gpt-5.4-mini": (0.75, 4.50),
    "gpt-5.4-nano": (0.20, 1.25),
    "o3-mini": (1.10, 4.40),
    "o1-preview": (15.00, 60.00),
    "o1-mini": (3.00, 12.00),
    "o1": (15.00, 60.00),
    
    # 3. Anthropic Claude (Latest Top Models)
    "claude-opus-4.8": (5.00, 25.00),
    "claude-sonnet-5": (3.00, 15.00),
    "claude-sonnet-4.6": (3.00, 15.00),
    "claude-haiku-4.5": (1.00, 5.00),
    
    # 4. DeepSeek (Latest Top Models)
    "deepseek-v4-pro": (1.74, 3.48),
    "deepseek-v4-flash": (0.14, 0.28),
    "deepseek-r1": (0.55, 2.19),
    "deepseek-chat": (0.14, 0.28),
    
    # 5. Kimi / Moonshot (Latest Top Models)
    "kimi-k2.7-code": (0.95, 4.00),
    "kimi-k2.6": (0.95, 4.00),
    "kimi-k2.5": (0.60, 3.00),
    "kimi": (0.95, 4.00),
    "moonshot": (0.95, 4.00),
}

def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Calculate the cost of an LLM invocation using local pricing map."""
    model_lower = model.lower()
    for key, (in_p, out_p) in PRICING_MAP.items():
        if key in model_lower:
            return (input_tokens * (in_p / 1_000_000.0)) + (output_tokens * (out_p / 1_000_000.0))
    # Fallback to general low-cost model pricing (e.g. gpt-4o-mini / gemini-1.5-flash)
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
    """Get or build an LLMService for a specific model name.
    If model_name is None, returns the default process-wide get_llm() instance.
    """
    credentials = _get_request_llm_credentials()
    if credentials:
        return _build_user_llm(credentials, model_name=model_name)
    _raise_if_server_fallback_disabled()

    if not model_name:
        return get_llm()

    tracer = get_tracer()
    model_lower = model_name.lower()

    if model_lower.startswith("gemini-"):
        from app.llm.providers.gemini_provider import GeminiProvider
        provider: LLMProvider = GeminiProvider(
            api_key=settings.GEMINI_API_KEY,
            model=model_name,
        )
        return LLMService(provider)
    elif model_lower.startswith("claude-"):
        from app.llm.providers.anthropic_provider import AnthropicProvider
        provider = AnthropicProvider(
            api_key=settings.ANTHROPIC_API_KEY,
            model=model_name,
        )
        return LLMService(provider)
    elif "/" in model_name or (settings.OPEN_ROUTER_API_KEY and not settings.OPENAI_API_KEY):
        from app.llm.providers.openai_provider import OpenAIProvider
        provider = OpenAIProvider(
            api_key=settings.OPEN_ROUTER_API_KEY or settings.OPENAI_API_KEY,
            model=model_name,
            base_url="https://openrouter.ai/api/v1" if settings.OPEN_ROUTER_API_KEY else None,
            default_headers={
                "HTTP-Referer": "http://localhost:8000",
                "X-Title": "Agentic RAG",
            } if settings.OPEN_ROUTER_API_KEY else None,
            tracer=tracer,
            name="openrouter" if settings.OPEN_ROUTER_API_KEY else "openai",
        )
        return LLMService(provider)
    else:
        from app.llm.providers.openai_provider import OpenAIProvider
        provider = OpenAIProvider(
            api_key=settings.OPENAI_API_KEY or settings.GEMINI_API_KEY,
            model=model_name,
            tracer=tracer,
            name="openai",
        )
        return LLMService(provider)


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
    """Build an LLM service using the current user's saved provider credentials."""
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

    if provider_name == "openrouter":
        from app.llm.providers.openai_provider import OpenAIProvider
        provider = OpenAIProvider(
            api_key=credentials.api_key,
            model=model,
            base_url=credentials.base_url or "https://openrouter.ai/api/v1",
            default_headers={
                "HTTP-Referer": "http://localhost:8000",
                "X-Title": "Agentic RAG",
            },
            tracer=tracer,
            name="openrouter",
        )
        return LLMService(provider)

    if provider_name == "openai":
        from app.llm.providers.openai_provider import OpenAIProvider
        provider = OpenAIProvider(
            api_key=credentials.api_key,
            model=model,
            base_url=credentials.base_url or None,
            tracer=tracer,
            name="openai",
        )
        return LLMService(provider)

    if provider_name == "anthropic":
        from app.llm.providers.anthropic_provider import AnthropicProvider
        provider = AnthropicProvider(
            api_key=credentials.api_key,
            model=model,
        )
        return LLMService(provider)

    raise ValueError(
        f"Unknown user LLM provider={provider_name!r}. "
        "Supported: 'openai', 'openrouter', 'gemini', 'anthropic'."
    )


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
    elif provider_name in ("auto", "openrouter") and settings.OPEN_ROUTER_API_KEY:
        from app.llm.providers.openai_provider import OpenAIProvider
        provider = OpenAIProvider(
            api_key=settings.OPEN_ROUTER_API_KEY,
            model=settings.OPEN_ROUTER_MODEL_NAME,
            base_url="https://openrouter.ai/api/v1",
            default_headers={
                "HTTP-Referer": "http://localhost:8000",
                "X-Title": "Agentic RAG",
            },
            tracer=tracer,
            name="openrouter",
        )
        logger.info("LLMService initialized: openrouter (model=%s)", provider.model)
    elif provider_name in ("auto", "openai"):
        from app.llm.providers.openai_provider import OpenAIProvider
        provider = OpenAIProvider(
            api_key=settings.OPENAI_API_KEY,
            model=settings.OPENAI_MODEL,
            tracer=tracer,
            name="openai",
        )
        logger.info("LLMService initialized: openai (model=%s)", provider.model)
    elif provider_name in ("auto", "anthropic") and settings.ANTHROPIC_API_KEY:
        from app.llm.providers.anthropic_provider import AnthropicProvider
        provider = AnthropicProvider(
            api_key=settings.ANTHROPIC_API_KEY,
            model=settings.ANTHROPIC_MODEL,
        )
        logger.info("LLMService initialized: anthropic (model=%s)", provider.model)
    else:
        raise ValueError(
            f"Unknown LLM_PROVIDER={provider_name!r}. "
            "Supported: 'auto', 'openai', 'openrouter', 'gemini', 'anthropic'."
        )

    return LLMService(provider)
