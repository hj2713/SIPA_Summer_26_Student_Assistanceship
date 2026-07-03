"""Gemini provider using the official google-genai SDK.

Translates between `app.llm.types` and the Google GenAI client configuration.
"""
from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Sequence
from typing import Any

from google import genai
from google.genai import types
from pydantic import BaseModel

from app.llm.types import (
    LLMChunk,
    LLMMessage,
    LLMTool,
    LLMToolCallDelta,
    LLMUsage,
)

logger = logging.getLogger(__name__)


class GeminiProvider:
    """Adapter for Google's GenAI Gemini models."""

    def __init__(
        self,
        *,
        api_key: str | None,
        model: str,
        name: str = "gemini",
    ) -> None:
        self._model = model
        self._name = name

        import os
        gcp_project = os.environ.get("GCP_PROJECT")
        google_creds = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")

        if google_creds and gcp_project:
            logger.info(
                "Initializing Gemini GenAI client using Vertex AI (project=%s, location=%s)",
                gcp_project,
                os.environ.get("GCP_LOCATION", "us-central1")
            )
            self._client = genai.Client(
                vertexai=True,
                project=gcp_project,
                location=os.environ.get("GCP_LOCATION", "us-central1")
            )
        else:
            logger.info("Initializing Gemini GenAI client using AI Studio")
            self._client = genai.Client(api_key=api_key)

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
        contents: list[types.Content] = []
        system_instruction: str | None = None

        for m in messages:
            if m.role == "system":
                system_instruction = m.content
            else:
                role = "user" if m.role == "user" else "model"
                contents.append(
                    types.Content(
                        role=role,
                        parts=[types.Part.from_text(text=m.content)]
                    )
                )

        config = types.GenerateContentConfig()
        if system_instruction:
            config.system_instruction = system_instruction

        response = await self._client.aio.models.generate_content_stream(
            model=self._model,
            contents=contents,
            config=config,
        )

        async for chunk in response:
            text_delta = chunk.text or ""
            usage_obj = getattr(chunk, "usage_metadata", None)
            usage = (
                LLMUsage(
                    input_tokens=getattr(usage_obj, "prompt_token_count", 0) or 0,
                    output_tokens=getattr(usage_obj, "candidates_token_count", 0) or 0,
                )
                if usage_obj is not None
                else None
            )
            yield LLMChunk(
                response_id=getattr(chunk, "response_id", "") or "",
                text_delta=text_delta,
                tool_call_deltas=(),
                usage=usage,
                finish_reason=None,
            )

    async def parse_structured(
        self,
        messages: Sequence[LLMMessage],
        schema: type[BaseModel],
    ) -> tuple[BaseModel, LLMUsage]:
        contents: list[types.Content] = []
        system_instruction: str | None = None

        for m in messages:
            if m.role == "system":
                system_instruction = m.content
            else:
                role = "user" if m.role == "user" else "model"
                contents.append(
                    types.Content(
                        role=role,
                        parts=[types.Part.from_text(text=m.content)]
                    )
                )

        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=schema,
        )
        if system_instruction:
            config.system_instruction = system_instruction

        response = await self._client.aio.models.generate_content(
            model=self._model,
            contents=contents,
            config=config,
        )

        if not response.text:
            raise ValueError(f"{self._name}: provider returned empty response")

        usage_obj = getattr(response, "usage_metadata", None)
        usage = LLMUsage(
            input_tokens=getattr(usage_obj, "prompt_token_count", 0) or 0,
            output_tokens=getattr(usage_obj, "candidates_token_count", 0) or 0,
        )

        cleaned = response.text.strip()
        import re
        cleaned = re.sub(r'^```[a-zA-Z]*\s*', '', cleaned)
        cleaned = re.sub(r'```$', '', cleaned)
        cleaned = re.sub(r"^'''[a-zA-Z]*\s*", '', cleaned)
        cleaned = re.sub(r"'''$", '', cleaned)
        cleaned = cleaned.strip()

        try:
            parsed = schema.model_validate_json(cleaned)
        except Exception as e:
            match = re.search(r'\{.*\}', cleaned, re.DOTALL)
            if match:
                try:
                    parsed = schema.model_validate_json(match.group(0))
                except Exception:
                    raise e
            else:
                raise e

        return parsed, usage
