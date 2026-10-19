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

class SinglePassBaselineOutput(BaseModel):
    single_pass_discretion_rank: int = Field(
        ...,
        ge=0,
        le=4,
        description="Overall Rough Guide Discretion Rank (0 to 4): 0=No Discretion (no delegation), 1=Minimal, 2=Limited, 3=Substantial, 4=High.",
    )
    single_pass_rationale: str = Field(
        ...,
        description="Concise rationale for the assigned discretion rank based directly on the law text.",
    )

async def test():
    llm = get_llm_for_model("gemini-3.1-flash-lite")
    test_text = "The Securities and Exchange Commission shall prescribe rules and regulations regarding the registration of national securities exchanges, with authority to exempt any exchange."
    messages = [
        LLMMessage(
            role="system",
            content=(
                "You are an expert legal coding analyst evaluating U.S. federal statutory text for administrative discretion.\n"
                "Directly classify the law into an overall Rough Guide discretion rank from 0 to 4:\n"
                "  0 = No Discretion: No delegation of authority exists.\n"
                "  1 = Minimal Discretion: Narrow, mechanical, procedural, ministerial, or tightly constrained authority.\n"
                "  2 = Limited Discretion: Real authority exists, but bounded by significant statutory constraints, reporting, or standards.\n"
                "  3 = Substantial Discretion: Meaningful authority to interpret, implement, supervise, or set standards, leaving significant room for judgment.\n"
                "  4 = High Discretion: Broad, unconstrained policymaking, rulemaking, or enforcement authority with few meaningful constraints.\n\n"
                "Directly evaluate the provided text without intermediate attribute classifications. Return single_pass_discretion_rank (0 to 4) and single_pass_rationale."
            ),
        ),
        LLMMessage(role="user", content=f"Statutory Text to evaluate:\n\n{test_text}"),
    ]
    res = await llm.parse_structured(messages, SinglePassBaselineOutput)
    print("Baseline test result:", res)

if __name__ == "__main__":
    asyncio.run(test())
