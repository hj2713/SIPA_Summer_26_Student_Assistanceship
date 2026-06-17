"""Tracer singleton — picks an implementation from settings."""
from __future__ import annotations

import logging

from app.core.config import settings
from app.llm.tracing.base import Tracer
from app.llm.tracing.langsmith_tracer import LangsmithTracer
from app.llm.tracing.noop_tracer import NoopTracer

logger = logging.getLogger(__name__)

_tracer_singleton: Tracer | None = None


def get_tracer() -> Tracer:
    """Return the process-wide `Tracer` singleton."""
    global _tracer_singleton
    if _tracer_singleton is None:
        _tracer_singleton = _build_tracer()
    return _tracer_singleton


def reset_tracer() -> None:
    """Clear the singleton. Intended for tests."""
    global _tracer_singleton
    _tracer_singleton = None


def _build_tracer() -> Tracer:
    provider = (settings.TRACING_PROVIDER or "auto").lower()

    if provider == "none":
        return NoopTracer()

    if provider in ("auto", "langsmith") and settings.LANGSMITH_TRACING and settings.LANGSMITH_API_KEY:
        return LangsmithTracer(
            api_key=settings.LANGSMITH_API_KEY,
            project=settings.LANGSMITH_PROJECT,
            endpoint=settings.LANGSMITH_ENDPOINT,
        )

    if provider not in ("auto", "langsmith", "none"):
        logger.warning("Unknown TRACING_PROVIDER=%r — falling back to noop", provider)

    return NoopTracer()
