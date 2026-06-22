import pytest

from app.workflows.executor import WorkflowExecutor
from app.workflows.expressions import evaluate_expression
from app.workflows.templates import delegation_discretion_definition
from app.workflows.validator import validate_workflow_definition


def test_reference_workflow_is_valid():
    issues = validate_workflow_definition(delegation_discretion_definition())
    assert [issue for issue in issues if issue.severity == "error"] == []


def test_delegation_false_condition_uses_structured_prior_output():
    definition = delegation_discretion_definition()
    condition = next(node for node in definition["nodes"] if node["id"] == "delegation_gate")
    assert evaluate_expression(
        condition["config"]["expression"],
        {"delegation_analysis.delegate_law": False},
    ) is True
    assert evaluate_expression(
        condition["config"]["expression"],
        {"delegation_analysis.delegate_law": True},
    ) is False


def test_validator_rejects_cycles():
    definition = delegation_discretion_definition()
    definition["edges"].append({
        "id": "cycle",
        "source": "dashboard_output",
        "target": "document_input",
    })
    issues = validate_workflow_definition(definition)
    assert any(issue.code == "cycle_detected" for issue in issues)


@pytest.mark.asyncio
async def test_executor_skips_rank_llm_when_delegation_is_false(monkeypatch):
    calls = []

    class FakeLlm:
        async def parse_structured(self, messages, schema, log_context=None):
            calls.append(log_context["workflow_node_id"])
            return schema(delegate_law=False)

    monkeypatch.setattr("app.workflows.executor.get_llm", lambda: FakeLlm())
    result = await WorkflowExecutor().execute(
        delegation_discretion_definition(),
        "The summary describes a technical filing change and grants no new authority.",
    )

    assert calls == ["delegation_analysis"]
    by_id = {item["node_id"]: item for item in result["trace"]}
    assert by_id["rank_zero"]["outputs"]["discretion_rank"] == 0
    assert by_id["discretion_analysis"]["status"] == "skipped"
