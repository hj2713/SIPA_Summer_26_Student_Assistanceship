import pytest
from pydantic import BaseModel
from unittest.mock import AsyncMock, MagicMock
from app.llm.providers.openai_provider import OpenAIProvider
from app.llm.types import LLMMessage

class MockStructuredSchema(BaseModel):
    delegate_law: bool
    delegation_rationale: str


class MockInventorySchema(BaseModel):
    inventory_agency_or_actor: list[str]
    inventory_delegated_authority: list[str]
    delegation_rationale: str

@pytest.mark.asyncio
async def test_openai_provider_parses_yaml_fallback():
    # Set up mock tracer/client
    tracer = MagicMock()
    # Mock AsyncOpenAI client wrapped by tracer
    wrapped_client = AsyncMock()
    tracer.wrap_client.return_value = wrapped_client
    
    provider = OpenAIProvider(
        api_key="fake-key",
        model="test-model",
        tracer=tracer
    )
    
    # Test case 1: Raw YAML list format matching the user's screenshot
    yaml_content = "- delegate_law: false\n  delegation_rationale: 'No delegation found.'"
    
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = yaml_content
    mock_response.usage = MagicMock(prompt_tokens=10, completion_tokens=20)
    
    wrapped_client.chat.completions.create.return_value = mock_response
    
    parsed, usage = await provider.parse_structured(
        messages=[LLMMessage(role="user", content="Hello")],
        schema=MockStructuredSchema
    )
    
    assert parsed.delegate_law is False
    assert parsed.delegation_rationale == "No delegation found."
    assert usage.input_tokens == 10
    assert usage.output_tokens == 20

@pytest.mark.asyncio
async def test_openai_provider_parses_standard_json():
    tracer = MagicMock()
    wrapped_client = AsyncMock()
    tracer.wrap_client.return_value = wrapped_client
    
    provider = OpenAIProvider(
        api_key="fake-key",
        model="test-model",
        tracer=tracer
    )
    
    json_content = '{"delegate_law": true, "delegation_rationale": "Delegation exists."}'
    
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json_content
    mock_response.usage = MagicMock(prompt_tokens=5, completion_tokens=15)
    
    wrapped_client.chat.completions.create.return_value = mock_response
    
    parsed, usage = await provider.parse_structured(
        messages=[],
        schema=MockStructuredSchema
    )
    
    assert parsed.delegate_law is True
    assert parsed.delegation_rationale == "Delegation exists."


@pytest.mark.asyncio
async def test_openai_provider_repairs_missing_required_fields_with_second_pass():
    tracer = MagicMock()
    wrapped_client = AsyncMock()
    tracer.wrap_client.return_value = wrapped_client

    provider = OpenAIProvider(
        api_key="fake-key",
        model="test-model",
        tracer=tracer
    )

    first_response = MagicMock()
    first_response.choices = [MagicMock()]
    first_response.choices[0].message.content = '{"delegate_law": true}'
    first_response.usage = MagicMock(prompt_tokens=7, completion_tokens=11)

    repair_response = MagicMock()
    repair_response.choices = [MagicMock()]
    repair_response.choices[0].message.content = '{"delegate_law": true, "delegation_rationale": "Delegation exists."}'
    repair_response.usage = MagicMock(prompt_tokens=5, completion_tokens=13)

    wrapped_client.chat.completions.create.side_effect = [first_response, repair_response]

    parsed, usage = await provider.parse_structured(
        messages=[LLMMessage(role="user", content="Hello")],
        schema=MockStructuredSchema
    )

    assert parsed.delegate_law is True
    assert parsed.delegation_rationale == "Delegation exists."
    assert usage.input_tokens == 12
    assert usage.output_tokens == 24
    assert wrapped_client.chat.completions.create.await_count == 2


@pytest.mark.asyncio
async def test_openai_provider_normalizes_aliases_and_string_lists():
    tracer = MagicMock()
    wrapped_client = AsyncMock()
    tracer.wrap_client.return_value = wrapped_client

    provider = OpenAIProvider(
        api_key="fake-key",
        model="test-model",
        tracer=tracer,
    )

    json_content = (
        '{'
        '"inventory_agency_or_actor": "Federal Reserve Board, Federal Home Loan Bank Board", '
        '"inventory_delegated_authority": "Regulate debt obligations, Set standards for member banks", '
        '"reasoning": "The model identified the relevant inventory items."'
        '}'
    )

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json_content
    mock_response.usage = MagicMock(prompt_tokens=12, completion_tokens=18)

    wrapped_client.chat.completions.create.return_value = mock_response

    parsed, usage = await provider.parse_structured(
        messages=[LLMMessage(role="user", content="Hello")],
        schema=MockInventorySchema,
    )

    assert parsed.inventory_agency_or_actor == [
        "Federal Reserve Board",
        "Federal Home Loan Bank Board",
    ]
    assert parsed.inventory_delegated_authority == [
        "Regulate debt obligations",
        "Set standards for member banks",
    ]
    assert parsed.delegation_rationale == "The model identified the relevant inventory items."
    assert usage.input_tokens == 12
    assert usage.output_tokens == 18


@pytest.mark.asyncio
async def test_openai_provider_uses_tool_call_arguments_when_content_missing():
    tracer = MagicMock()
    wrapped_client = AsyncMock()
    tracer.wrap_client.return_value = wrapped_client

    provider = OpenAIProvider(
        api_key="fake-key",
        model="test-model",
        tracer=tracer,
    )

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = None
    mock_response.choices[0].message.tool_calls = [
        MagicMock(
            function=MagicMock(
                arguments='{"delegate_law": false, "delegation_rationale": "No delegation found."}'
            )
        )
    ]
    mock_response.usage = MagicMock(prompt_tokens=4, completion_tokens=6)

    wrapped_client.chat.completions.create.return_value = mock_response

    parsed, usage = await provider.parse_structured(
        messages=[LLMMessage(role="user", content="Hello")],
        schema=MockStructuredSchema,
    )

    assert parsed.delegate_law is False
    assert parsed.delegation_rationale == "No delegation found."
    assert usage.input_tokens == 4
    assert usage.output_tokens == 6


@pytest.mark.asyncio
async def test_openai_provider_mentions_json_for_structured_output_when_prompt_does_not():
    tracer = MagicMock()
    wrapped_client = AsyncMock()
    tracer.wrap_client.return_value = wrapped_client

    provider = OpenAIProvider(
        api_key="fake-key",
        model="test-model",
        tracer=tracer,
    )

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = '{"delegate_law": true, "delegation_rationale": "Delegation exists."}'
    mock_response.usage = MagicMock(prompt_tokens=9, completion_tokens=14)
    wrapped_client.chat.completions.create.return_value = mock_response

    await provider.parse_structured(
        messages=[LLMMessage(role="user", content="Classify this law.")],
        schema=MockStructuredSchema,
    )

    sent_messages = wrapped_client.chat.completions.create.await_args.kwargs["messages"]
    assert sent_messages[0]["role"] == "system"
    assert "json" in sent_messages[0]["content"].lower()
