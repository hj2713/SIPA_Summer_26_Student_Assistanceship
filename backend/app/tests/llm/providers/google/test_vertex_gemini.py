import os
import pytest
from pydantic import BaseModel
from dotenv import load_dotenv

# Load local .env
load_dotenv()

from app.llm import get_llm_for_model
from app.llm.types import LLMMessage

@pytest.mark.asyncio
async def test_vertex_gemini_integration():
    """Test that the Gemini Vertex AI integration is configured and can make successful calls."""
    # Ensure Vertex AI environment variables are present
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    project_id = os.environ.get("GCP_PROJECT")
    
    assert creds_path, "GOOGLE_APPLICATION_CREDENTIALS is not configured in .env"
    assert project_id, "GCP_PROJECT is not configured in .env"
    
    print(f"\nTesting Vertex AI using project: {project_id}")
    print(f"Credentials file path: {creds_path}")
    assert os.path.exists(creds_path), f"Credentials file does not exist at: {creds_path}"
    
    # Initialize Vertex AI for gemini-3.5-flash
    llm = get_llm_for_model("gemini-3.5-flash")
    assert llm.provider_name == "gemini"
    assert llm.model == "gemini-3.5-flash"
    
    messages = [
        LLMMessage(role="user", content="Hello, Gemini! Please respond with 'OK'")
    ]
    
    # 1. Test streaming
    chunks = []
    async for chunk in llm.stream_chat(messages):
        chunks.append(chunk.text_delta)
    
    response_text = "".join(chunks)
    assert len(response_text) > 0, "Vertex Gemini streaming returned empty response"
    print(f"\nVertex Gemini Stream Output: {response_text}")
    
    # 2. Test structured output
    class TestSchema(BaseModel):
        confirmation: str
        status: bool

    res = await llm.parse_structured(messages, TestSchema)
    assert isinstance(res, TestSchema)
    assert res.status is True or res.status is False
    print(f"Vertex Gemini Structured Output: {res}")
