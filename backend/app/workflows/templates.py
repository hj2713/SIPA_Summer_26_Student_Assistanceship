from typing import Any, Dict


def blank_workflow_definition() -> Dict[str, Any]:
    return {
        "schema_version": 1,
        "nodes": [
            {
                "id": "document_input",
                "kind": "document_input",
                "name": "Document input",
                "description": "The source document and its metadata.",
                "position": {"x": 80, "y": 220},
                "config": {"source_policy": "campaign_source"},
            },
            {
                "id": "dashboard_output",
                "kind": "output",
                "name": "Dashboard output",
                "description": "Fields made available to future campaigns.",
                "position": {"x": 700, "y": 220},
                "config": {"fields": []},
            },
        ],
        "edges": [],
        "outputs": [],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    }


def delegation_discretion_definition() -> Dict[str, Any]:
    return {
        "schema_version": 1,
        "nodes": [
            {
                "id": "document_input",
                "kind": "document_input",
                "name": "CQ summary input",
                "description": "The controlled source text used for benchmark comparison.",
                "position": {"x": 40, "y": 260},
                "config": {"source_policy": "cq_summary"},
            },
            {
                "id": "delegation_analysis",
                "kind": "llm",
                "name": "Delegation analysis",
                "description": "Identify delegation, actors, authorities, evidence, and centrality.",
                "position": {"x": 330, "y": 260},
                "config": {
                    "document_context": "source_text",
                    "instructions": "Determine whether the law creates or materially expands administrative authority. Return every configured field with concise supporting evidence.",
                    "input_fields": [],
                    "outputs": [
                        {"key": "delegate_law", "label": "Delegate law", "type": "boolean", "required": True},
                        {"key": "administrative_actors", "label": "Administrative actors", "type": "list[string]", "required": False},
                        {"key": "delegated_authorities", "label": "Delegated authorities", "type": "list[string]", "required": False},
                        {"key": "authority_evidence", "label": "Authority evidence", "type": "evidence[]", "required": False},
                        {"key": "delegation_centrality", "label": "Delegation centrality", "type": "enum", "options": ["minor", "supporting", "central"], "required": False},
                    ],
                },
            },
            {
                "id": "delegation_gate",
                "kind": "condition",
                "name": "Delegation found?",
                "description": "Avoid the rank LLM when the prior decision is false.",
                "position": {"x": 650, "y": 260},
                "config": {
                    "expression": {
                        "op": "eq",
                        "left": {"field": "delegation_analysis.delegate_law"},
                        "right": {"literal": False},
                    },
                    "true_label": "No delegation",
                    "false_label": "Delegation found",
                },
            },
            {
                "id": "rank_zero",
                "kind": "set_value",
                "name": "Set rank to zero",
                "description": "Deterministic result: no delegation means no discretion.",
                "position": {"x": 970, "y": 90},
                "config": {
                    "assignments": [
                        {"field": "discretion_rank", "type": "integer", "value": 0},
                        {"field": "discretion_rationale", "type": "string", "value": "No delegation was identified."},
                    ]
                },
            },
            {
                "id": "discretion_analysis",
                "kind": "llm",
                "name": "Discretion analysis",
                "description": "Rank discretion using selected delegation outputs and source text.",
                "position": {"x": 970, "y": 420},
                "config": {
                    "document_context": "source_text",
                    "instructions": "Apply the Rough Guide rank from 1 to 4 using the identified authority, centrality, constraints, and evidence.",
                    "input_fields": [
                        "delegation_analysis.delegate_law",
                        "delegation_analysis.administrative_actors",
                        "delegation_analysis.delegated_authorities",
                        "delegation_analysis.authority_evidence",
                        "delegation_analysis.delegation_centrality",
                    ],
                    "outputs": [
                        {"key": "discretion_rank", "label": "Discretion rank", "type": "integer", "minimum": 1, "maximum": 4, "required": True},
                        {"key": "discretion_rationale", "label": "Discretion rationale", "type": "string", "required": True},
                        {"key": "rank_evidence", "label": "Rank evidence", "type": "evidence[]", "required": False},
                    ],
                },
            },
            {
                "id": "consistency_check",
                "kind": "validation",
                "name": "Consistency check",
                "description": "Ensure delegation and rank follow the codebook relationship.",
                "position": {"x": 1280, "y": 260},
                "config": {
                    "rules": [
                        {
                            "name": "No delegation implies rank zero",
                            "expression": {
                                "op": "or",
                                "args": [
                                    {"op": "neq", "left": {"field": "delegation_analysis.delegate_law"}, "right": {"literal": False}},
                                    {"op": "eq", "left": {"field": "discretion_rank"}, "right": {"literal": 0}},
                                ],
                            },
                            "severity": "error",
                        }
                    ]
                },
            },
            {
                "id": "dashboard_output",
                "kind": "output",
                "name": "Dashboard output",
                "description": "Grouped fields exposed when campaigns adopt this workflow.",
                "position": {"x": 1580, "y": 260},
                "config": {
                    "fields": [
                        "delegation_analysis.delegate_law",
                        "delegation_analysis.administrative_actors",
                        "delegation_analysis.delegated_authorities",
                        "delegation_analysis.authority_evidence",
                        "delegation_analysis.delegation_centrality",
                        "discretion_rank",
                        "discretion_rationale",
                        "rank_evidence",
                    ]
                },
            },
        ],
        "edges": [
            {"id": "e-input-delegation", "source": "document_input", "target": "delegation_analysis"},
            {"id": "e-delegation-gate", "source": "delegation_analysis", "target": "delegation_gate"},
            {"id": "e-gate-zero", "source": "delegation_gate", "target": "rank_zero", "source_handle": "true", "label": "No delegation"},
            {"id": "e-gate-rank", "source": "delegation_gate", "target": "discretion_analysis", "source_handle": "false", "label": "Delegation found"},
            {"id": "e-zero-validate", "source": "rank_zero", "target": "consistency_check"},
            {"id": "e-rank-validate", "source": "discretion_analysis", "target": "consistency_check"},
            {"id": "e-validate-output", "source": "consistency_check", "target": "dashboard_output"},
        ],
        "outputs": [
            {"key": "delegate_law", "source": "delegation_analysis.delegate_law", "group": "Delegation"},
            {"key": "administrative_actors", "source": "delegation_analysis.administrative_actors", "group": "Delegation"},
            {"key": "delegated_authorities", "source": "delegation_analysis.delegated_authorities", "group": "Delegation"},
            {"key": "authority_evidence", "source": "delegation_analysis.authority_evidence", "group": "Delegation"},
            {"key": "delegation_centrality", "source": "delegation_analysis.delegation_centrality", "group": "Delegation"},
            {"key": "discretion_rank", "source": "discretion_rank", "group": "Discretion"},
            {"key": "discretion_rationale", "source": "discretion_rationale", "group": "Discretion"},
        ],
        "viewport": {"x": 0, "y": 0, "zoom": 0.75},
    }


WORKFLOW_TEMPLATES = {
    "blank": blank_workflow_definition,
    "delegation_discretion": delegation_discretion_definition,
}

