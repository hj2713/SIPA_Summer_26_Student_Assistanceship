"""LLM service package.

Single point of contact for all LLM interactions in the application.
Services should import `get_llm()` and call its methods rather than
talking to provider SDKs directly.

Add a new provider by:
  1. Creating `app/llm/providers/<vendor>_provider.py` that implements
     the `LLMProvider` protocol from `app.llm.base`.
  2. Registering it in `app.llm.registry._build_llm`.
"""
from app.llm.base import LLMProvider
from app.llm.registry import LLMService, get_llm, get_llm_for_model, reset_llm
from app.llm.types import (
    LLMChunk,
    LLMMessage,
    LLMTool,
    LLMToolCall,
    LLMToolCallDelta,
    LLMUsage,
)

__all__ = [
    "LLMChunk",
    "LLMMessage",
    "LLMProvider",
    "LLMService",
    "LLMTool",
    "LLMToolCall",
    "LLMToolCallDelta",
    "LLMUsage",
    "get_llm",
    "get_llm_for_model",
    "reset_llm",
]
