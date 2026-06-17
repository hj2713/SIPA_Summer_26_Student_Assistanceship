"""LangSmith tracer.

Sets the LangChain env vars (which LangSmith reads) at construction time
and dispatches `wrap_client` to the right SDK wrapper based on provider.
"""
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


class LangsmithTracer:
    name = "langsmith"

    def __init__(self, *, api_key: str, project: str, endpoint: str) -> None:
        os.environ["LANGCHAIN_TRACING_V2"] = "true"
        os.environ["LANGCHAIN_API_KEY"] = api_key
        os.environ["LANGCHAIN_PROJECT"] = project
        os.environ["LANGCHAIN_ENDPOINT"] = endpoint

    def wrap_client(self, client: Any, *, provider: str) -> Any:
        # OpenAI-shaped clients (includes OpenRouter) all use wrap_openai.
        if provider in ("openai", "openrouter"):
            try:
                from langsmith.wrappers import wrap_openai
                wrapped = wrap_openai(client)
                logger.info("LangSmith tracing enabled for provider=%s", provider)
                return wrapped
            except ImportError:
                logger.warning("langsmith not installed — tracing disabled")
                return client
        # Future: add wrap_anthropic etc.
        logger.info("LangSmith has no wrapper for provider=%s — returning unwrapped client", provider)
        return client
