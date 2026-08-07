import json
import pytest
from app.services.workflow_service import WorkflowService
from app.workflows.executor import WorkflowExecutor
from app.workflows.templates import WORKFLOW_TEMPLATES
from app.workflows.validator import validate_workflow_definition


def test_structured_law_summarizer_template_validity():
    template = WORKFLOW_TEMPLATES["structured_law_summarizer"]()
    assert template["schema_version"] == 1
    assert len(template["nodes"]) == 6
    assert len(template["edges"]) == 5
    assert len(template["outputs"]) == 9

    node_ids = [node["id"] for node in template["nodes"]]
    assert node_ids == [
        "document_input",
        "section_breakdown_analysis",
        "crs_provisions_analysis",
        "administrative_delegation_analysis",
        "executive_crs_synthesis",
        "dashboard_output",
    ]

    issues = validate_workflow_definition(template)
    assert issues == []


def test_structured_law_summarizer_db_seeding():
    svc = WorkflowService()
    svc.ensure_seed_templates("TEST")

    with svc.db_session_factory() as session:
        row = session.workflow_templates.get_by_slug("TEST", "structured_law_summarizer")
        assert row is not None
        assert row["name"] == "Structured Law Summarizer"
        definition = json.loads(row["definition_json"])
        assert len(definition["nodes"]) == 6


@pytest.mark.asyncio
async def test_structured_law_summarizer_dry_run_execution():
    executor = WorkflowExecutor()
    template = WORKFLOW_TEMPLATES["structured_law_summarizer"]()

    sample_law_text = """
    Public Law 83-577 - Securities Exchange Act Amendments of 1954
    Be it enacted by the Senate and House of Representatives of the United States of America in Congress assembled,
    Section 1. That the Securities Exchange Act of 1934 is hereby amended to permit underwriters to make offers by means of a prospectus filed with the Securities and Exchange Commission during the waiting period before the registration statement becomes effective.
    Section 2. The Securities and Exchange Commission shall reduce from one year to 40 days the period after the beginning of a securities offering during which a prospectus must be delivered.
    Section 3. The Commission is authorized to issue rules and regulations to govern investment companies engaging in continuous offerings of shares.
    """

    class DummyLLM:
        async def parse_structured(self, messages, schema=None, log_context=None, temperature=0.0):
            schema_name = schema.__name__ if schema else ""
            if "section_breakdown" in schema_name or "WorkflowNode_section_breakdown" in schema_name:
                return schema(
                    major_statutory_sections=["Section 1: Prospectus Filing in Waiting Period", "Section 2: Delivery Window Reduction", "Section 3: Investment Company Rulemaking"],
                    legal_taxonomy_categories=["Statutory Amendments", "Regulatory Mandates", "Administrative Rulemaking"]
                )
            elif "crs_provisions" in schema_name or "WorkflowNode_crs_provisions" in schema_name:
                return schema(
                    short_title_and_purpose="Securities Exchange Act Amendments of 1954 - Permit earlier prospectus delivery and authorize SEC rulemaking for continuous offerings.",
                    amended_us_code_sections=["15 U.S.C. 77e", "15 U.S.C. 78j"],
                    effective_timeline="Immediate upon enactment",
                    penalties_and_enforcement=["SEC administrative injunctions", "Prospectus non-delivery civil liability"]
                )
            elif "administrative_delegation" in schema_name or "WorkflowNode_administrative_delegation" in schema_name:
                return schema(
                    administrative_actors=["Securities and Exchange Commission (SEC)"],
                    delegated_rulemaking_powers=["Issue rules and regulations governing investment companies engaging in continuous share offerings"],
                    statutory_constraints=["Bounded by Securities Exchange Act of 1934 statutory guidelines"]
                )
            elif "executive_crs" in schema_name or "WorkflowNode_executive_crs" in schema_name:
                return schema(
                    structured_crs_summary_markdown="# Public Law 83-577 Executive Summary\nAmends Securities Exchange Act of 1934.\n\n## Core Provisions\n- Reduces delivery window to 40 days.\n- Grants SEC rulemaking authority."
                )
            return schema()

    import app.workflows.executor as exec_module
    original_get_llm = exec_module.get_llm_for_model
    exec_module.get_llm_for_model = lambda model_name: DummyLLM()
    exec_module.get_llm = lambda: DummyLLM()

    try:
        results = await executor.execute(template, source_text=sample_law_text)
        outputs = results["outputs"]
        assert outputs["short_title_and_purpose"].startswith("Securities Exchange Act Amendments of 1954")
        assert "Securities and Exchange Commission (SEC)" in outputs["administrative_actors"]
        assert len(outputs["major_statutory_sections"]) == 3
        assert "# Public Law 83-577 Executive Summary" in outputs["structured_crs_summary_markdown"]
        assert len(results["trace"]) == 6
    finally:
        exec_module.get_llm_for_model = original_get_llm
        exec_module.get_llm = original_get_llm
