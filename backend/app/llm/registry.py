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
from app.llm.base import LLMProvider
from app.llm.tracing import get_tracer
from app.llm.types import LLMChunk, LLMMessage, LLMTool

logger = logging.getLogger(__name__)


from typing import Any
import uuid
from app.llm.types import LLMUsage

# Model pricing matrix per 1M tokens: (input cost per 1M, output cost per 1M)
PRICING_MAP = {
    "gemini-3.1-flash-lite-preview": (0.075, 0.30),
    "gemini-1.5-flash": (0.075, 0.30),
    "gemini-1.5-pro": (1.25, 5.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
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
            conn.execute(
                """
                INSERT INTO llm_usage_logs (
                    id, provider, model, service, campaign_id, thread_id, input_tokens, output_tokens, calculated_cost
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
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
    global _llm_singleton
    if _llm_singleton is None:
        _llm_singleton = _build_llm()
    return _llm_singleton


def get_llm_for_model(model_name: str | None = None) -> LLMService:
    """Get or build an LLMService for a specific model name.
    If model_name is None, returns the default process-wide get_llm() instance.
    """
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
    else:
        raise ValueError(
            f"Unknown LLM_PROVIDER={provider_name!r}. "
            "Supported: 'auto', 'openai', 'openrouter', 'gemini'."
        )

    return LLMService(provider)
