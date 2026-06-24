import pytest

from app.workflows.executor import WorkflowExecutor
from app.workflows.expressions import evaluate_expression
from app.workflows.templates import delegation_discretion_definition, law_delegation_discretion_rank_definition
from app.workflows.validator import validate_workflow_definition


def test_reference_workflow_is_valid():
    issues = validate_workflow_definition(delegation_discretion_definition())
    assert [issue for issue in issues if issue.severity == "error"] == []


def test_law_delegation_rank_workflow_is_valid_and_emits_two_outputs():
    definition = law_delegation_discretion_rank_definition()
    issues = validate_workflow_definition(definition)

    assert [issue for issue in issues if issue.severity == "error"] == []
    law_delegation = next(node for node in definition["nodes"] if node["id"] == "law_delegation")
    assert [output["key"] for output in law_delegation["config"]["outputs"]] == [
        "delegate_law",
        "delegation_rationale",
        "administrative_actors",
        "delegated_authorities",
        "constraints_summary",
        "constraint_strength",
        "delegation_breadth",
        "delegation_centrality",
    ]
    discretion_rank = next(node for node in definition["nodes"] if node["id"] == "discretion_rank")
    assert discretion_rank["config"]["input_fields"] == [
        "law_delegation.delegate_law",
        "law_delegation.delegation_rationale",
        "law_delegation.administrative_actors",
        "law_delegation.delegated_authorities",
        "law_delegation.constraints_summary",
        "law_delegation.constraint_strength",
        "law_delegation.delegation_breadth",
        "law_delegation.delegation_centrality",
    ]
    assert definition["outputs"] == [
        {"key": "delegate_law", "source": "law_delegation.delegate_law", "group": "Final"},
        {"key": "discretion_rank", "source": "discretion_rank", "group": "Final"},
    ]
    output_node = next(node for node in definition["nodes"] if node["id"] == "dashboard_output")
    assert output_node["config"]["fields"] == [
        {"source": "law_delegation.delegate_law", "key": "delegate_law", "label": "Delegate Law"},
        {"source": "discretion_rank", "key": "discretion_rank", "label": "Discretion Rank"},
    ]


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


@pytest.mark.asyncio
async def test_project_workflow_keeps_delegation_details_internal_when_false(monkeypatch):
    calls = []

    class FakeLlm:
        async def parse_structured(self, messages, schema, log_context=None):
            calls.append(log_context["workflow_node_id"])
            return schema(
                delegate_law=False,
                delegation_rationale="Agency is mentioned but no new authority is granted.",
                administrative_actors=[],
                delegated_authorities=[],
                constraints_summary="No delegated authority, so constraints are not applicable.",
                constraint_strength="none",
                delegation_breadth="none",
                delegation_centrality="none",
            )

    monkeypatch.setattr("app.workflows.executor.get_llm", lambda: FakeLlm())
    result = await WorkflowExecutor().execute(
        law_delegation_discretion_rank_definition(),
        "The law only changes a filing deadline and grants no new agency authority.",
    )

    assert calls == ["law_delegation"]
    assert result["outputs"] == {"delegate_law": False, "discretion_rank": 0}
    assert "delegation_rationale" not in result["outputs"]
    assert result["trace"][1]["outputs"]["delegation_rationale"]
    by_id = {item["node_id"]: item for item in result["trace"]}
    assert by_id["discretion_rank"]["status"] == "skipped"


@pytest.mark.asyncio
async def test_project_workflow_uses_delegation_details_for_rank_when_true(monkeypatch):
    calls = []

    class FakeLlm:
        async def parse_structured(self, messages, schema, log_context=None):
            node_id = log_context["workflow_node_id"]
            calls.append(node_id)
            if node_id == "law_delegation":
                return schema(
                    delegate_law=True,
                    delegation_rationale="The SEC receives new rulemaking authority.",
                    administrative_actors=["SEC"],
                    delegated_authorities=["rulemaking"],
                    constraints_summary="The authority is bounded by statutory deadlines and disclosure scope.",
                    constraint_strength="moderate",
                    delegation_breadth="moderate",
                    delegation_centrality="central",
                )
            return schema(
                discretion_rank=3,
                discretion_rationale="Meaningful rulemaking authority with constraints.",
                rank_evidence=["The SEC must issue disclosure rules."],
            )

    monkeypatch.setattr("app.workflows.executor.get_llm", lambda: FakeLlm())
    result = await WorkflowExecutor().execute(
        law_delegation_discretion_rank_definition(),
        "The law directs the SEC to issue rules governing financial disclosures.",
    )

    assert calls == ["law_delegation", "discretion_rank"]
    assert result["outputs"] == {"delegate_law": True, "discretion_rank": 3}
    assert "delegation_rationale" not in result["outputs"]
