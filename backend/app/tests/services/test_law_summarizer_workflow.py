import json
import pytest
from app.services.workflow_service import WorkflowService
from app.workflows.executor import WorkflowExecutor
from app.workflows.templates import WORKFLOW_TEMPLATES
from app.workflows.validator import validate_workflow_definition


def test_structured_law_summarizer_template_validity():
    template = WORKFLOW_TEMPLATES["structured_law_summarizer"]()
    assert template["schema_version"] == 1
    assert len(template["nodes"]) == 5
    assert len(template["edges"]) == 4
    assert len(template["outputs"]) == 7

    node_ids = [node["id"] for node in template["nodes"]]
    assert node_ids == [
        "document_input",
        "executive_purpose_analysis",
        "key_provisions_analysis",
        "summary_assembly",
        "dashboard_output",
    ]

    issues = validate_workflow_definition(template)
    assert issues == []


def test_structured_law_summarizer_db_seeding():
    svc = WorkflowService()
    svc.ensure_seed_templates("PRODUCTION")

    with svc.db_session_factory() as session:
        row = session.workflow_templates.get_by_slug("PRODUCTION", "structured_law_summarizer")
        assert row is not None
        assert row["name"] == "Structured Law Summarizer"
        definition = json.loads(row["definition_json"])
        assert len(definition["nodes"]) == 5


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
            if "executive_purpose" in schema_name or "WorkflowNode_executive_purpose" in schema_name:
                return schema(
                    executive_summary="The bill amends the Securities Exchange Act of 1934 to permit earlier prospectus distribution by underwriters and reduce delivery waiting periods.",
                    primary_policy_objectives=["Facilitate securities information distribution", "Modernize SEC registration procedures"]
                )
            elif "key_provisions" in schema_name or "WorkflowNode_key_provisions" in schema_name:
                return schema(
                    administrative_actors=["Securities and Exchange Commission (SEC)"],
                    key_provisions=["Permits offers via prospectus during waiting period", "Reduces prospectus delivery window from 1 year to 40 days", "Authorizes SEC rulemaking for continuous offerings"],
                    statutory_constraints=["Rulemaking bounded by Securities Exchange Act of 1934"]
                )
            elif "summary_assembly" in schema_name or "WorkflowNode_summary_assembly" in schema_name:
                return schema(
                    structured_summary_markdown="# PL 83-577 Executive Summary\nAmends Securities Exchange Act of 1934.\n\n## Key Provisions\n- Reduces waiting period to 40 days.\n- Grants SEC rulemaking power.",
                    amended_statutes_or_context="Securities Exchange Act of 1934"
                )
            return schema()

    import app.workflows.executor as exec_module
    original_get_llm = exec_module.get_llm_for_model
    exec_module.get_llm_for_model = lambda model_name: DummyLLM()
    exec_module.get_llm = lambda: DummyLLM()

    try:
        results = await executor.execute(template, source_text=sample_law_text)
        outputs = results["outputs"]
        assert outputs["executive_summary"].startswith("The bill amends")
        assert "Securities and Exchange Commission (SEC)" in outputs["administrative_actors"]
        assert len(outputs["key_provisions"]) == 3
        assert "# PL 83-577 Executive Summary" in outputs["structured_summary_markdown"]
        assert len(results["trace"]) == 5
    finally:
        exec_module.get_llm_for_model = original_get_llm
        exec_module.get_llm = original_get_llm
