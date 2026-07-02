"""OpenAI provider — also handles OpenRouter (any OpenAI-compatible endpoint).

Translates between `app.llm.types` and the OpenAI SDK shape so the rest
of the app never depends on the SDK directly.
"""
from __future__ import annotations

import logging
import re
from collections.abc import AsyncIterator, Sequence
from typing import Any

from openai import AsyncOpenAI
from pydantic import BaseModel

from app.llm.tracing.base import Tracer
from app.llm.types import (
    LLMChunk,
    LLMMessage,
    LLMTool,
    LLMToolCallDelta,
    LLMUsage,
)

logger = logging.getLogger(__name__)


class OpenAIProvider:
    """Adapter for OpenAI's Chat Completions API (or any compatible endpoint)."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        tracer: Tracer,
        base_url: str | None = None,
        default_headers: dict[str, str] | None = None,
        name: str = "openai",
    ) -> None:
        raw = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
            default_headers=default_headers,
        )
        self._client = tracer.wrap_client(raw, provider=name)
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
        kwargs: dict[str, Any] = {
            "model": self._model,
            "messages": [_to_openai_message(m) for m in messages],
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if tools:
            kwargs["tools"] = [_to_openai_tool(t) for t in tools]
        if force_tool:
            kwargs["tool_choice"] = {
                "type": "function",
                "function": {"name": force_tool},
            }

        response = await self._client.chat.completions.create(**kwargs)
        async for chunk in response:
            yield _from_openai_chunk(chunk)

    async def parse_structured(
        self,
        messages: Sequence[LLMMessage],
        schema: type[BaseModel],
    ) -> tuple[BaseModel, LLMUsage]:
        base_messages = [_to_openai_message(m) for m in messages]
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=base_messages,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content
        if not content:
            raise ValueError(f"{self._name}: provider returned empty response")

        cleaned = _clean_structured_text(content)
        usage = _usage_from_response(response)

        try:
            parsed = _parse_structured_payload(cleaned, schema)
            return parsed, usage
        except Exception as first_error:
            logger.warning(
                "%s: structured parse failed for model=%s, attempting one repair pass: %s",
                self._name,
                self._model,
                first_error,
            )

            repair_messages = [
                *base_messages,
                {"role": "assistant", "content": cleaned},
                {
                    "role": "user",
                    "content": (
                        f"Your previous response did not satisfy the required schema {schema.__name__}. "
                        "Return corrected JSON only. Include every required field and keep all keys explicit. "
                        f"Validation error: {first_error}"
                    ),
                },
            ]
            repair_response = await self._client.chat.completions.create(
                model=self._model,
                messages=repair_messages,
                response_format={"type": "json_object"},
            )
            repair_content = repair_response.choices[0].message.content
            if not repair_content:
                raise ValueError(f"{self._name}: provider returned empty response on structured repair pass")
            repair_cleaned = _clean_structured_text(repair_content)
            repair_usage = _usage_from_response(repair_response)
            combined_usage = LLMUsage(
                input_tokens=usage.input_tokens + repair_usage.input_tokens,
                output_tokens=usage.output_tokens + repair_usage.output_tokens,
            )
            parsed = _parse_structured_payload(repair_cleaned, schema)
            return parsed, combined_usage


# ---------------------------------------------------------------------------
# Translation helpers (LLM types <-> OpenAI SDK shape)
# ---------------------------------------------------------------------------


def _to_openai_message(m: LLMMessage) -> dict[str, Any]:
    """Convert an `LLMMessage` to an OpenAI chat message dict."""
    out: dict[str, Any] = {"role": m.role, "content": m.content}
    if m.name is not None:
        out["name"] = m.name
    if m.tool_call_id is not None:
        out["tool_call_id"] = m.tool_call_id
    if m.tool_calls:
        out["tool_calls"] = [
            {
                "id": tc.id,
                "type": "function",
                "function": {"name": tc.name, "arguments": tc.arguments},
            }
            for tc in m.tool_calls
        ]
    return out


def _to_openai_tool(t: LLMTool) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": t.name,
            "description": t.description,
            "parameters": t.parameters,
        },
    }


def _from_openai_chunk(chunk: Any) -> LLMChunk:
    """Convert an OpenAI streaming chunk into a provider-neutral `LLMChunk`."""
    response_id = getattr(chunk, "id", "") or ""

    usage_obj = getattr(chunk, "usage", None)
    usage = (
        LLMUsage(
            input_tokens=getattr(usage_obj, "prompt_tokens", 0) or 0,
            output_tokens=getattr(usage_obj, "completion_tokens", 0) or 0,
        )
        if usage_obj is not None
        else None
    )

    text_delta = ""
    tool_call_deltas: list[LLMToolCallDelta] = []
    finish_reason: str | None = None

    if chunk.choices:
        choice = chunk.choices[0]
        finish_reason = getattr(choice, "finish_reason", None)
        delta = getattr(choice, "delta", None)
        if delta is not None:
            if getattr(delta, "content", None):
                text_delta = delta.content
            for tc in getattr(delta, "tool_calls", None) or []:
                fn = getattr(tc, "function", None)
                tool_call_deltas.append(
                    LLMToolCallDelta(
                        id=getattr(tc, "id", None),
                        name=getattr(fn, "name", None) if fn else None,
                        arguments_delta=(getattr(fn, "arguments", "") or "") if fn else "",
                    )
                )

    return LLMChunk(
        response_id=response_id,
        text_delta=text_delta,
        tool_call_deltas=tuple(tool_call_deltas),
        usage=usage,
        finish_reason=finish_reason,
    )


def _clean_structured_text(content: str) -> str:
    cleaned = content.strip()
    cleaned = re.sub(r'^```[a-zA-Z]*\s*', '', cleaned)
    cleaned = re.sub(r'```$', '', cleaned)
    cleaned = re.sub(r"^'''[a-zA-Z]*\s*", '', cleaned)
    cleaned = re.sub(r"'''$", '', cleaned)
    return cleaned.strip()


def _parse_structured_payload(cleaned: str, schema: type[BaseModel]) -> BaseModel:
    try:
        return schema.model_validate_json(cleaned)
    except Exception as original_error:
        match = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if match:
            try:
                return schema.model_validate_json(match.group(0))
            except Exception:
                pass
        try:
            import yaml

            parsed_yaml = yaml.safe_load(cleaned)
            if isinstance(parsed_yaml, list) and len(parsed_yaml) > 0 and isinstance(parsed_yaml[0], dict):
                parsed_yaml = parsed_yaml[0]
            if isinstance(parsed_yaml, dict):
                return schema.model_validate(parsed_yaml)
        except Exception:
            pass
        raise original_error


def _usage_from_response(response: Any) -> LLMUsage:
    usage_obj = getattr(response, "usage", None)
    return LLMUsage(
        input_tokens=getattr(usage_obj, "prompt_tokens", 0) or 0,
        output_tokens=getattr(usage_obj, "completion_tokens", 0) or 0,
    )
