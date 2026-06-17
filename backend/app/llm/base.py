"""Protocol that every LLM provider adapter must implement.

Using `typing.Protocol` rather than an abstract base class so adapters
don't need to inherit anything — structural typing keeps the contract
explicit while allowing adapters to be plain classes.
"""
from collections.abc import AsyncIterator, Sequence
from typing import Protocol, runtime_checkable

from pydantic import BaseModel

from app.llm.types import LLMChunk, LLMMessage, LLMTool


@runtime_checkable
class LLMProvider(Protocol):
    """A vendor-specific adapter (OpenAI, Anthropic, Gemini, ...)."""

    @property
    def model(self) -> str:
        """The model identifier being used (e.g. 'gpt-4.1-mini')."""
        ...

    @property
    def name(self) -> str:
        """Short identifier of this provider ('openai', 'anthropic', ...).

        Used by the tracer to dispatch to the right wrapper.
        """
        ...

    def stream_chat(
        self,
        messages: Sequence[LLMMessage],
        *,
        tools: Sequence[LLMTool] = (),
        force_tool: str | None = None,
    ) -> AsyncIterator[LLMChunk]:
        """Stream a chat completion as a sequence of `LLMChunk`s.

        Args:
            messages: Conversation history (system + user + assistant + tool turns).
            tools: Optional tool definitions the model may call.
            force_tool: If set, force the model to call this tool name on this turn.

        Yields:
            `LLMChunk` instances. Text chunks set `text_delta`; tool-call
            chunks set `tool_call_deltas`; the final chunk typically carries
            `usage` and `finish_reason`.
        """
        ...

    async def parse_structured(
        self,
        messages: Sequence[LLMMessage],
        schema: type[BaseModel],
    ) -> tuple[BaseModel, LLMUsage]:
        """Non-streaming structured-output call.

        Returns a tuple of (BaseModel instance, LLMUsage).
        Raises `ValueError` if the provider returns no parsed output.
        """
        ...
