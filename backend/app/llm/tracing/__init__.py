"""Tracer abstraction for LLM observability.

Lets you swap LangSmith for Phoenix / Langfuse / Helicone / etc. without
touching provider adapters. Each tracer can wrap a raw SDK client so its
calls are auto-instrumented.
"""
from app.llm.tracing.base import Tracer
from app.llm.tracing.registry import get_tracer, reset_tracer

__all__ = ["Tracer", "get_tracer", "reset_tracer"]
