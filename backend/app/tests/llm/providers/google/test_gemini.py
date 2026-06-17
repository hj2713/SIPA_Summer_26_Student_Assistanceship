import pytest
from pydantic import BaseModel

from app.core.config import settings
from app.llm import get_llm
from app.llm.types import LLMMessage

@pytest.mark.asyncio
async def test_gemini_integration():
    """Test that the Gemini integration is configured and can make successful calls."""
    # Ensure provider is gemini
    assert settings.LLM_PROVIDER == "gemini", "LLM_PROVIDER must be set to 'gemini' to test Gemini"
    assert settings.GEMINI_API_KEY, "GEMINI_API_KEY must be configured in environment"
    
    llm = get_llm()
    assert llm.provider_name == "gemini"
    assert llm.model == settings.GEMINI_MODEL
    
    messages = [
        LLMMessage(role="user", content="Hello, Gemini! Please respond with 'OK'")
    ]
    
    # 1. Test streaming
    chunks = []
    async for chunk in llm.stream_chat(messages):
        chunks.append(chunk.text_delta)
    
    response_text = "".join(chunks)
    assert len(response_text) > 0, "Gemini streaming returned empty response"
    print(f"\nGemini Stream Output: {response_text}")
    
    # 2. Test structured output
    class TestSchema(BaseModel):
        confirmation: str
        status: bool

    res = await llm.parse_structured(messages, TestSchema)
    assert isinstance(res, TestSchema)
    assert res.status is True or res.status is False
    print(f"Gemini Structured Output: {res}")
