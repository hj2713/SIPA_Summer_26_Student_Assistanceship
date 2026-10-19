import os
import sys
import asyncio
from pydantic import BaseModel, Field

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(root_dir, "backend")
sys.path.insert(0, backend_dir)
os.chdir(backend_dir)

from app.llm.registry import get_llm_for_model
from app.llm.types import LLMMessage

class TestSchema(BaseModel):
    greeting: str = Field(..., description="Greeting message")
    number: int = Field(..., description="A test number")

models = [
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "deepseek/deepseek-chat",
    "qwen/qwen3-235b-a22b-2507",
    "moonshotai/kimi-k2.5",
    "openai/gpt-oss-120b",
]

async def test_model(m):
    try:
        llm = get_llm_for_model(m)
        messages = [
            LLMMessage(role="system", content="You are a helpful assistant. Output valid JSON matching schema."),
            LLMMessage(role="user", content="Say hello and give the number 42."),
        ]
        res = await llm.parse_structured(messages, TestSchema)
        print(f"✔ SUCCESS for {m}: {res}")
        return True
    except Exception as e:
        print(f"✖ FAILED for {m}: {e}")
        return False

async def main():
    print("Testing LLM connectivity for models:")
    for m in models:
        await test_model(m)

if __name__ == "__main__":
    asyncio.run(main())
