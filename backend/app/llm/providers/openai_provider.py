"""OpenAI provider — also handles OpenRouter (any OpenAI-compatible endpoint).

Translates between `app.llm.types` and the OpenAI SDK shape so the rest
of the app never depends on the SDK directly.
"""
from __future__ import annotations

import logging
import json
import re
from collections.abc import AsyncIterator, Sequence
from typing import Any, get_args, get_origin

from openai import AsyncOpenAI
from pydantic import BaseModel

from app.core.config import settings
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
        timeout_seconds: float | None = None,
    ) -> None:
        effective_timeout = timeout_seconds
        if effective_timeout is None:
            effective_timeout = max(1.0, float(settings.OPENAI_REQUEST_TIMEOUT_SECONDS))
        raw = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
            default_headers=default_headers,
            timeout=effective_timeout,
        )
        self._client = tracer.wrap_client(raw, provider=name)
        self._model = model
        self._name = name
        self._timeout_seconds = effective_timeout

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
        content = _extract_message_text(response.choices[0].message if getattr(response, "choices", None) else None)
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
            repair_content = _extract_message_text(repair_response.choices[0].message if getattr(repair_response, "choices", None) else None)
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
        parsed_json = _try_parse_json_or_yaml(cleaned)
        if isinstance(parsed_json, dict):
            try:
                return schema.model_validate(_normalize_structured_payload(parsed_json, schema))
            except Exception:
                pass

        match = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if match:
            try:
                parsed_json = json.loads(match.group(0))
                if isinstance(parsed_json, dict):
                    return schema.model_validate(_normalize_structured_payload(parsed_json, schema))
            except Exception:
                pass
        try:
            import yaml

            parsed_yaml = yaml.safe_load(cleaned)
            if isinstance(parsed_yaml, list) and len(parsed_yaml) > 0 and isinstance(parsed_yaml[0], dict):
                parsed_yaml = parsed_yaml[0]
            if isinstance(parsed_yaml, dict):
                return schema.model_validate(_normalize_structured_payload(parsed_yaml, schema))
        except Exception:
            pass
        raise original_error


def _extract_message_text(message: Any) -> str | None:
    if message is None:
        return None

    content = getattr(message, "content", None)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
                continue
            if isinstance(item, dict):
                text_value = item.get("text")
                if isinstance(text_value, str) and text_value.strip():
                    parts.append(text_value)
                    continue
                parts.append(json.dumps(item, ensure_ascii=False))
                continue
            text_value = getattr(item, "text", None)
            if isinstance(text_value, str) and text_value.strip():
                parts.append(text_value)
                continue
            parts.append(str(item))
        joined = "\n".join(part for part in parts if part is not None)
        if joined.strip():
            return joined
    if isinstance(content, dict):
        return json.dumps(content, ensure_ascii=False)
    if content not in (None, ""):
        return str(content)

    tool_calls = getattr(message, "tool_calls", None) or []
    for tool_call in tool_calls:
        fn = getattr(tool_call, "function", None)
        arguments = getattr(fn, "arguments", None) if fn is not None else None
        if isinstance(arguments, str) and arguments.strip():
            return arguments
        if arguments not in (None, ""):
            return str(arguments)

    return None


def _normalize_structured_payload(payload: dict[str, Any], schema: type[BaseModel]) -> dict[str, Any]:
    normalized = dict(payload)

    wrapper_keys = ("outputs", "output", "result", "data", "response", "message", "content")
    for key in wrapper_keys:
        nested = normalized.get(key)
        if isinstance(nested, dict) and _dict_has_schema_fields(nested, schema):
            nested_normalized = _normalize_structured_payload(nested, schema)
            merged = dict(normalized)
            merged.update(nested_normalized)
            normalized = merged
            break

    field_names = list(schema.model_fields.keys())
    for field_name, field in schema.model_fields.items():
        if field_name in normalized and normalized[field_name] not in (None, ""):
            normalized[field_name] = _coerce_schema_value(normalized[field_name], field.annotation)
            continue

        for candidate in _field_aliases(field_name):
            candidate_value = _lookup_candidate_value(normalized, candidate)
            if candidate_value not in (None, ""):
                normalized[field_name] = _coerce_schema_value(candidate_value, field.annotation)
                break

    return {key: normalized[key] for key in normalized if key in field_names or key not in {"outputs", "output", "result", "data", "response", "message", "content"}}


def _dict_has_schema_fields(payload: dict[str, Any], schema: type[BaseModel]) -> bool:
    keys = {str(key) for key in payload.keys()}
    for field_name in schema.model_fields.keys():
        if field_name in keys:
            return True
        if any(candidate in keys for candidate in _field_aliases(field_name)):
            return True
    return False


def _lookup_candidate_value(payload: dict[str, Any], candidate: str) -> Any:
    if candidate in payload:
        return payload[candidate]
    normalized_candidate = _normalize_key(candidate)
    for key, value in payload.items():
        if _normalize_key(str(key)) == normalized_candidate:
            return value
    for wrapper_key in ("outputs", "output", "result", "data", "response", "message", "content"):
        nested = payload.get(wrapper_key)
        if isinstance(nested, dict):
            value = _lookup_candidate_value(nested, candidate)
            if value not in (None, ""):
                return value
    return None


def _field_aliases(field_name: str) -> list[str]:
    aliases = [field_name, _normalize_key(field_name)]
    lower_name = field_name.lower()
    heuristic_aliases = {
        "delegation_rationale": ["reasoning", "rationale", "explanation", "analysis", "justification", "message", "summary"],
        "delegation_reasoning": ["reasoning", "rationale", "explanation", "analysis", "justification", "message", "summary"],
        "inventory_agency_or_actor": ["agency_or_actor", "agency", "actors", "actor", "agency_or_actors"],
        "inventory_delegated_authority": ["delegated_authority", "authority", "authorities", "delegated_authorities"],
        "inventory_affirmative_discretion_signals": ["affirmative_discretion_signals", "discretion_signals", "signals"],
        "inventory_constraint_evidence": ["constraint_evidence", "constraints", "constraint", "evidence"],
        "inventory_residual_leeway": ["residual_leeway", "leeway", "discretion_level"],
        "discretion_rationale": ["reasoning", "rationale", "explanation", "analysis", "justification", "message", "summary"],
        "m9_decision_rationale": ["reasoning", "rationale", "explanation", "analysis", "justification", "message", "summary"],
        "b3_band_rationale": ["reasoning", "rationale", "explanation", "analysis", "justification", "message", "summary"],
        "b3_branch_rationale": ["reasoning", "rationale", "explanation", "analysis", "justification", "message", "summary"],
        "b3_decision_rationale": ["reasoning", "rationale", "explanation", "analysis", "justification", "message", "summary"],
    }
    aliases.extend(heuristic_aliases.get(lower_name, []))
    return list(dict.fromkeys(alias for alias in aliases if alias))


def _normalize_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _coerce_schema_value(value: Any, annotation: Any) -> Any:
    if value is None:
        return None

    origin = get_origin(annotation)
    args = get_args(annotation)

    if origin is not None and type(None) in args and len(args) > 1:
        non_none_args = [arg for arg in args if arg is not type(None)]
        if non_none_args:
            annotation = non_none_args[0]
            origin = get_origin(annotation)
            args = get_args(annotation)

    if origin in {list, tuple, set} or annotation in {list, tuple, set}:
        if isinstance(value, list):
            return [_coerce_list_item(item) for item in value]
        if isinstance(value, tuple):
            return [_coerce_list_item(item) for item in list(value)]
        if isinstance(value, set):
            return [_coerce_list_item(item) for item in list(value)]
        if isinstance(value, str):
            parsed = _try_parse_json_or_yaml(value)
            if isinstance(parsed, list):
                return [_coerce_list_item(item) for item in parsed]
            if isinstance(parsed, dict):
                return [_coerce_list_item(item) for item in parsed.values()]
            return _split_string_to_list(value)
        return [_coerce_list_item(value)]

    if annotation is bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in {"true", "t", "yes", "y", "1"}:
                return True
            if lowered in {"false", "f", "no", "n", "0"}:
                return False

    if annotation in {int, float}:
        if isinstance(value, (int, float)):
            return value
        if isinstance(value, str):
            try:
                return int(value) if annotation is int else float(value)
            except Exception:
                pass

    if annotation is str and isinstance(value, (dict, list)):
        if isinstance(value, list) and len(value) == 1 and isinstance(value[0], str):
            return value[0]
        return json.dumps(value, ensure_ascii=False)

    if isinstance(value, dict):
        # Prefer the most natural string-ish field when providers wrap their own JSON objects.
        for key in ("text", "value", "reasoning", "rationale", "explanation", "analysis", "message", "summary"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate

    return value


def _coerce_list_item(item: Any) -> Any:
    if isinstance(item, str):
        return item.strip()
    return item


def _try_parse_json_or_yaml(value: str) -> Any:
    try:
        return json.loads(value)
    except Exception:
        pass
    try:
        import yaml

        return yaml.safe_load(value)
    except Exception:
        return value


def _split_string_to_list(value: str) -> list[str]:
    parts = re.split(r"[\n,;•]+", value)
    cleaned = [part.strip(" -\t\r") for part in parts if part and part.strip(" -\t\r")]
    return cleaned or [value.strip()]


def _usage_from_response(response: Any) -> LLMUsage:
    usage_obj = getattr(response, "usage", None)
    return LLMUsage(
        input_tokens=getattr(usage_obj, "prompt_tokens", 0) or 0,
        output_tokens=getattr(usage_obj, "completion_tokens", 0) or 0,
    )
