import os
import sys
import json
import re
import csv
import asyncio
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

# Add backend directory to Python path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
sys.path.append(backend_dir)
project_root = os.path.abspath(os.path.join(backend_dir, ".."))
experiment_dir = os.path.dirname(__file__)


# Load backend environment variables
env_file = os.path.join(backend_dir, ".env")
if os.path.exists(env_file):
    with open(env_file, "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                parts = line.split("=", 1)
                if len(parts) == 2:
                    os.environ[parts[0].strip()] = parts[1].strip()

# Import LLM structures from backend app
from app.llm import LLMMessage, get_llm
from few_shot_context import get_few_shot_prompt_text
from segmenter import split_into_sections, screen_active_sections

# Define Pydantic Schema for the Coded Output matching the research guidelines
class CodedResult(BaseModel):
    DelegateLaw: str = Field(..., description="Y if the law delegates authority to an agency/actor, N if simple extension or no delegation. Must be Y or N.")
    Delegees: str = Field(..., description="Comma-separated list of administrative actors receiving authority, or 'None'.")
    NewAgencyCreated: str = Field(..., description="Y only if establishing a brand-new independent administrative agency/board/commission from scratch. N otherwise. Must be Y or N.")
    ApptPower: str = Field(..., description="Y only if specifying appointment powers for principal officers. N otherwise. Must be Y or N.")
    ApptComment: str = Field(..., description="Text citation supporting ApptPower, or 'Not mentioned'.")
    
    TimeLimits: str = Field(..., description="Y only if specifying sunset/expiration of the delegated authority/program itself. N for reporting/study timelines. Must be Y or N.")
    TimeComment: str = Field(..., description="Text citation supporting TimeLimits, or 'Not mentioned'.")
    SpendLimits: str = Field(..., description="Y only if imposing a budget ceiling or administrative expense cap. N for standard appropriations. Must be Y or N.")
    SpendingComment: str = Field(..., description="Text citation supporting SpendLimits, or 'Not mentioned'.")
    
    LegAxnReq: str = Field(..., description="Y if subsequent legislative approval is required for agency action. Must be Y or N.")
    LegAxnComment: str = Field(..., description="Text citation supporting LegAxnReq, or 'Not mentioned'.")
    ExecAxnReq: str = Field(..., description="Y if executive approval by President/cabinet head is required for agency action. Must be Y or N.")
    ExecAxnComment: str = Field(..., description="Text citation supporting ExecAxnReq, or 'Not mentioned'.")
    LegVeto: str = Field(..., description="Y if there is a legislative veto provision over rules. Must be Y or N.")
    VetoComment: str = Field(..., description="Text citation supporting LegVeto, or 'Not mentioned'.")
    
    ReportReq: str = Field(..., description="Y only if required to submit formal reports directly to Congress or the President. Must be Y or N.")
    ReportComment: str = Field(..., description="Text citation supporting ReportReq, or 'Not mentioned'.")
    Consultation: str = Field(..., description="Y only if required to consult/co-ordinate with another agency/advisory committee. Must be Y or N.")
    ConsultComment: str = Field(..., description="Text citation supporting Consultation, or 'Not mentioned'.")
    PubHearings: str = Field(..., description="Y if required to hold public hearings or notice/hearing procedures. Must be Y or N.")
    HearingComment: str = Field(..., description="Text citation supporting PubHearings, or 'Not mentioned'.")
    AppealsProc: str = Field(..., description="Y if specifying administrative/judicial appeals procedures for affected parties. Must be Y or N.")
    AppealsComment: str = Field(..., description="Text citation supporting AppealsProc, or 'Not mentioned'.")
    RuleReqs: str = Field(..., description="Y if specifying rulemaking mandates, notice-and-comment, or standards. Must be Y or N.")
    RuleComment: str = Field(..., description="Text citation supporting RuleReqs, or 'Not mentioned'.")
    
    Exemptions: str = Field(..., description="Y only if defining scope exclusions or carve-outs preventing agency regulation of certain entities/sectors. Must be Y or N.")
    ExempComment: str = Field(..., description="Text citation supporting Exemptions, or 'Not mentioned'.")
    Compensations: str = Field(..., description="Y only if managing salary scales, payout funds, or budget structures. Must be Y or N.")
    CompensComment: str = Field(..., description="Text citation supporting Compensations, or 'Not mentioned'.")
    DirectOversight: str = Field(..., description="Y only if mandating review/audit by external watchdogs like GAO or Congress. Must be Y or N.")
    OversightComment: str = Field(..., description="Text citation supporting DirectOversight, or 'Not mentioned'.")
    Studies: str = Field(..., description="Y if commissioning specific studies/evaluations by the agency. Must be Y or N.")
    StudiesComment: str = Field(..., description="Text citation supporting Studies, or 'Not mentioned'.")
    
    Discretion_Rank: int = Field(..., description="Overall Rough Guide Discretion Rank (0 to 4). Must follow consistency rules: Rank 0 if DelegateLaw is N; Rank 1 for simple reauthorizations/ministerial; Rank 2 for limited/highly constrained; Rank 3 for substantial; Rank 4 for high/unconstrained.")
    Final_Rationale: str = Field(..., description="1-2 sentences summarizing how the presence/absence of constraints leads to the final discretion rank.")
    Notes: str = Field(..., description="Optional research notes, or 'None'.")

# Prompt v6 System Guidelines
PROMPT_V6_GUIDELINES = """You are coding a law for the level of discretionary authority delegated to administrative actors.
Complete each stage sequentially. Identify delegation and constraints before assigning the final discretion rank.

=== GENERAL RULES ===
1. Code only the text supplied. Do not infer authority or constraints from background law unless explicitly mentioned.
2. DelegateLaw: Y means the law gives an agency/actor responsibility to act. N means no delegation or simple extension.
3. Discretion: Room to choose policy, standards, exemptions, waivers, or enforcement priorities.
4. Constraint: Statutory limits that reduce discretion (procedures, reports, consultations, spending caps, sunsets, GAO audits).
5. For all boolean indicators, assign 'Y' or 'N' (case-sensitive) and provide text citations.
"""

async def code_single_document(file_path: str, pl_num: str) -> Dict[str, Any]:
    print(f"\nProcessing Law {pl_num} ({os.path.basename(file_path)})...")
    
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        full_text = f.read()
        
    # Segment and filter text to avoid context limits and keep context clean
    sections = split_into_sections(full_text)
    filtered_text = screen_active_sections(sections, max_chars=50000)
    print(f"Segmented {len(sections)} sections. Reduced content size to {len(filtered_text)} characters.")
    
    # Compile prompt components
    few_shot_prompt = get_few_shot_prompt_text()
    
    system_prompt = (
        f"{PROMPT_V6_GUIDELINES}\n\n"
        f"{few_shot_prompt}\n\n"
        "Analyze the provided law text and extract values according to the requested JSON schema. "
        "Strictly adhere to the coding criteria and logical consistency rules."
    )
    
    llm = get_llm()
    
    try:
        parsed = await llm.parse_structured(
            [
                LLMMessage(role="system", content=system_prompt),
                LLMMessage(role="user", content=f"Law Text content to code (PL {pl_num}):\n\n{filtered_text}"),
            ],
            schema=CodedResult,
            log_context={"service": "eval_pipeline", "pl_num": pl_num}
        )
        if parsed is None:
            raise ValueError(f"LLM returned empty parsed result for PL {pl_num}")
        
        result_dict = parsed.model_dump()
        return result_dict
    except Exception as e:
        print(f"Error coding PL {pl_num}: {e}")
        return {}

def format_markdown_log(pl_num: str, result: Dict[str, Any]) -> str:
    """Format the structured coding output into the stage-by-stage log the professor requested."""
    log = f"# Legislative Coding Output: PL {pl_num}\n\n"
    
    log += "## STAGE 1: DELEGATION & AGENCY STRUCTURE SCREEN\n"
    log += f"* **DelegateLaw**: {result.get('DelegateLaw')}\n"
    log += f"* **Delegees**: {result.get('Delegees')}\n"
    log += f"* **NewAgencyCreated**: {result.get('NewAgencyCreated')}\n"
    log += f"* **ApptPower**: {result.get('ApptPower')}\n"
    log += f"  * *Appointment Comment*: {result.get('ApptComment')}\n\n"
    
    log += "## STAGE 2: SPECIFIC PROCEDURAL AND STATUTORY CONSTRAINTS\n"
    constraints = [
        ("Time Limits / sunsets", "TimeLimits", "TimeComment"),
        ("Spending Limits / caps", "SpendLimits", "SpendingComment"),
        ("Legislative Action Required", "LegAxnReq", "LegAxnComment"),
        ("Executive Action Required", "ExecAxnReq", "ExecAxnComment"),
        ("Legislative Veto", "LegVeto", "VetoComment"),
        ("Reporting Requirements", "ReportReq", "ReportComment"),
        ("Consultation / Coordination", "Consultation", "ConsultComment"),
        ("Public Hearings", "PubHearings", "HearingComment"),
        ("Appeals Procedures", "AppealsProc", "AppealsComment"),
        ("Rulemaking Requirements", "RuleReqs", "RuleComment"),
        ("Exemptions / Carve-outs", "Exemptions", "ExempComment"),
        ("Compensation / Budget structures", "Compensations", "CompensComment"),
        ("Direct Watchdog Oversight (GAO)", "DirectOversight", "OversightComment"),
        ("Studies Commissioned", "Studies", "StudiesComment")
    ]
    for label, indicator_key, comment_key in constraints:
        log += f"* **{label}**: {result.get(indicator_key)}\n"
        log += f"  * *Citation/Evidence*: {result.get(comment_key)}\n"
        
    log += "\n## STAGE 3: SUMMARY AND OVERALL DISCRETION CLASSIFICATION\n"
    log += f"* **Discretion_Rank**: {result.get('Discretion_Rank')}/4\n"
    log += f"* **Final_Rationale**: {result.get('Final_Rationale')}\n"
    log += f"* **Notes**: {result.get('Notes')}\n"
    
    return log

async def main():
    test_dir = os.environ.get("EVAL_INPUT_DIR", os.path.join(project_root, "Updates", "15 Laws Summary"))
    output_dir = os.environ.get("EVAL_OUTPUT_DIR", os.path.join(experiment_dir, "outputs"))
    os.makedirs(output_dir, exist_ok=True)
    
    # Regex to pull PLNum from filename: e.g. 1971_92-221_HR9961.txt -> 92-221
    filename_pattern = re.compile(r"\d+-\d+")

    
    files = [f for f in os.listdir(test_dir) if f.endswith(".txt")]
    files.sort()
    
    eval_results = []
    
    for filename in files:
        file_path = os.path.join(test_dir, filename)
        match = filename_pattern.search(filename)
        pl_num = match.group(0) if match else filename.replace(".txt", "")
        
        result = await code_single_document(file_path, pl_num)
        if result:
            eval_results.append((pl_num, result))
            
            # Save Stage log for the professor
            log_content = format_markdown_log(pl_num, result)
            log_path = os.path.join(output_dir, f"stage_logs_{pl_num}.md")
            with open(log_path, "w", encoding="utf-8") as lf:
                lf.write(log_content)
                
            # Briefly sleep to respect api limits
            await asyncio.sleep(2)
            
    # Write summary CSV matching the schema format
    csv_path = os.path.join(output_dir, "eval_results.csv")
    if eval_results:
        headers = ["PLNum"] + list(eval_results[0][1].keys())
        with open(csv_path, "w", newline="", encoding="utf-8") as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=headers)
            writer.writeheader()
            for pl_num, res in eval_results:
                row = {"PLNum": pl_num}
                row.update(res)
                writer.writerow(row)
                
        print(f"\nEvaluation Run Complete! Results written to {csv_path}")
        print(f"Stage-by-stage markdown logs generated in {output_dir}")

if __name__ == "__main__":
    asyncio.run(main())
