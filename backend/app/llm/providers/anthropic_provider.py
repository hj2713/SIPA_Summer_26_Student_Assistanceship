"""Anthropic provider using the official anthropic SDK.

Translates between `app.llm.types` and the Anthropic client configuration.
"""
from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Sequence
from typing import Any

import anthropic
from pydantic import BaseModel

from app.llm.types import (
    LLMChunk,
    LLMMessage,
    LLMTool,
    LLMToolCallDelta,
    LLMUsage,
)

logger = logging.getLogger(__name__)


class AnthropicProvider:
    """Adapter for Anthropic's Claude models."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        name: str = "anthropic",
    ) -> None:
        self._client = anthropic.AsyncAnthropic(api_key=api_key)
        self._model = model
        self._name = name

    @property
    def model(self) -> str:
        return self._model

    @property
    def name(self) -> str:
        return self._name

    async def stream_chat(
        self,
        messages: Sequence[LLMMessage],
        *,
        tools: Sequence[LLMTool] = (),
        force_tool: str | None = None,
    ) -> AsyncIterator[LLMChunk]:
        anthropic_messages: list[dict[str, Any]] = []
        system_instruction: str | None = None

        for m in messages:
            if m.role == "system":
                system_instruction = m.content
            else:
                role = "user" if m.role == "user" else "assistant"
                anthropic_messages.append({"role": role, "content": m.content})

        kwargs: dict[str, Any] = {
            "model": self._model,
            "max_tokens": 4096,
            "messages": anthropic_messages,
        }
        if system_instruction:
            kwargs["system"] = system_instruction

        # Convert tools to Anthropic format if any are present
        if tools:
            anthropic_tools = []
            for t in tools:
                anthropic_tools.append({
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.parameters,
                })
            kwargs["tools"] = anthropic_tools

        if force_tool:
            kwargs["tool_choice"] = {"type": "tool", "name": force_tool}

        response = await self._client.messages.create(
            stream=True,
            **kwargs
        )

        input_tokens = 0
        output_tokens = 0
        async for event in response:
            text_delta = ""
            tool_call_deltas: list[LLMToolCallDelta] = []

            if event.type == "message_start":
                input_tokens = getattr(event.message.usage, "input_tokens", 0) or 0
            elif event.type == "content_block_delta":
                if event.delta.type == "text_delta":
                    text_delta = event.delta.text
                elif event.delta.type == "input_json_delta":
                    tool_call_deltas.append(
                        LLMToolCallDelta(
                            id=None,
                            name=None,
                            arguments_delta=event.delta.partial_json,
                        )
                    )
            elif event.type == "message_delta":
                output_tokens = getattr(event.usage, "output_tokens", 0) or 0

            usage = None
            if input_tokens > 0 or output_tokens > 0:
                usage = LLMUsage(input_tokens=input_tokens, output_tokens=output_tokens)

            yield LLMChunk(
                response_id="",
                text_delta=text_delta,
                tool_call_deltas=tuple(tool_call_deltas),
                usage=usage,
                finish_reason=None,
            )

    async def parse_structured(
        self,
        messages: Sequence[LLMMessage],
        schema: type[BaseModel],
    ) -> tuple[BaseModel, LLMUsage]:
        anthropic_messages: list[dict[str, Any]] = []
        system_instruction: str | None = None

        for m in messages:
            if m.role == "system":
                system_instruction = m.content
            else:
                role = "user" if m.role == "user" else "assistant"
                anthropic_messages.append({"role": role, "content": m.content})

        schema_name = schema.__name__
        tool_definition = {
            "name": schema_name,
            "description": f"Output the structured data matching {schema_name}.",
            "input_schema": schema.model_json_schema()
        }

        response = await self._client.messages.create(
            model=self._model,
            max_tokens=4096,
            system=system_instruction or anthropic.NOT_GIVEN,
            messages=anthropic_messages,
            tools=[tool_definition],
            tool_choice={"type": "tool", "name": schema_name}
        )

        tool_use = None
        for block in response.content:
            if block.type == "tool_use":
                tool_use = block
                break

        if not tool_use:
            raise ValueError(f"{self._name}: provider did not call forced tool '{schema_name}' for structured output.")

        parsed = schema.model_validate(tool_use.input)
        usage = LLMUsage(
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens
        )
        return parsed, usage
