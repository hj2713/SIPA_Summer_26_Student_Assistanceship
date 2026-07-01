from __future__ import annotations

from copy import deepcopy
from typing import Any


BUILDER_KIND = "discretion_workflow"
BUILDER_VERSION = 1


def _field(
    key: str,
    label: str,
    field_type: str,
    *,
    required: bool = False,
    visibility: str = "internal",
    options: list[str] | None = None,
    minimum: int | None = None,
    maximum: int | None = None,
) -> dict[str, Any]:
    field: dict[str, Any] = {
        "key": key,
        "label": label,
        "type": field_type,
        "required": required,
        "visibility": visibility,
    }
    if options:
        field["options"] = options
    if minimum is not None:
        field["minimum"] = minimum
    if maximum is not None:
        field["maximum"] = maximum
    return field


def default_builder_metadata() -> dict[str, Any]:
    return {
        "builder": {
            "kind": BUILDER_KIND,
            "version": BUILDER_VERSION,
            "source_policy": "full_text",
            "mode": "cascade",
            "calibration_enabled": False,
            "label_overrides": {
                "binary_high_class": "agency",
                "binary_low_class": "bounded",
            },
            "stages": {
                "delegation": {
                    "title": "Delegation Gate",
                    "purpose": "Keep Prompt_v8 as the delegation gate before any discretion ranking happens.",
                    "instructions": (
                        "Apply the current Prompt_v8 benchmark-aligned delegation logic. "
                        "Do not treat a mere agency mention, filing requirement, exemption, or procedural amendment as delegation by itself."
                    ),
                    "outputs": [
                        _field("delegate_law", "Delegate Law", "boolean", required=True, visibility="final"),
                        _field("delegation_rationale", "Delegation rationale", "string", required=True),
                        _field("administrative_actors", "Administrative actors", "list[string]"),
                        _field("delegated_authorities", "Delegated authorities", "list[string]"),
                        _field("constraints_summary", "Constraints summary", "string"),
                        _field(
                            "constraint_strength",
                            "Constraint strength",
                            "enum",
                            required=True,
                            options=["none", "weak", "moderate", "strong"],
                        ),
                        _field(
                            "delegation_breadth",
                            "Delegation breadth",
                            "enum",
                            required=True,
                            options=["none", "narrow", "moderate", "broad"],
                        ),
                        _field(
                            "delegation_centrality",
                            "Delegation centrality",
                            "enum",
                            required=True,
                            options=["none", "minor", "supporting", "central"],
                        ),
                    ],
                },
                "inventory": {
                    "title": "Discretion Inventory",
                    "purpose": "Inventory affirmative discretion signals, constraints, and residual agency leeway before the final rank decision.",
                    "instructions": (
                        "Inventory first, judge second, rank last. Identify delegated authority, affirmative discretion signals, "
                        "constraint evidence, residual leeway, and the most likely provisional rank."
                    ),
                    "outputs": [
                        _field("delegated_authority_summary", "Delegated authority summary", "string", required=True),
                        _field("affirmative_discretion_signals", "Affirmative discretion signals", "list[string]"),
                        _field("constraint_evidence", "Constraint evidence", "list[string]"),
                        _field(
                            "residual_leeway",
                            "Residual leeway",
                            "enum",
                            required=True,
                            options=["None", "Low", "Bounded", "Substantial", "High"],
                        ),
                        _field("provisional_rank", "Provisional rank", "integer", required=True, minimum=1, maximum=4),
                        _field("boundary_decision", "Boundary decision", "string", required=True),
                    ],
                },
                "multiclass": {
                    "title": "Multiclass Rank",
                    "purpose": "Assign one discretion rank from 1 to 4 in a single stage while still surfacing signals and constraints.",
                    "instructions": (
                        "Use the M9 multiclass framing. Prefer the lower rank when the evidence is mixed. "
                        "Do not inflate a score merely because the statute uses broad verbs such as regulate, determine, waive, or exempt."
                    ),
                    "outputs": [
                        _field("affirmative_discretion_signals", "Affirmative discretion signals", "list[string]"),
                        _field("constraint_evidence", "Constraint evidence", "list[string]"),
                        _field(
                            "residual_leeway",
                            "Residual leeway",
                            "enum",
                            required=True,
                            options=["None", "Low", "Bounded", "Substantial", "High"],
                        ),
                        _field("boundary_decision", "Boundary decision", "string", required=True),
                        _field("discretion_rank", "Discretion Rank", "integer", required=True, minimum=1, maximum=4, visibility="final"),
                        _field("discretion_rationale", "Discretion rationale", "string", required=True),
                    ],
                },
                "binary_split": {
                    "title": "Binary Split",
                    "purpose": "Classify the law into the lower or higher discretion band before choosing the final adjacent rank.",
                    "instructions": (
                        "Use the streamlined binary screen first: distinguish lower-bounded discretion from the higher policy-shaping band. "
                        "Treat the higher class label as the professor's requested 'agency' label."
                    ),
                    "outputs": [
                        _field("discretion_band", "Discretion band", "enum", required=True, options=["bounded", "agency"]),
                        _field("band_rationale", "Band rationale", "string", required=True),
                        _field("affirmative_discretion_signals", "Affirmative discretion signals", "list[string]"),
                        _field("constraint_evidence", "Constraint evidence", "list[string]"),
                    ],
                },
                "low_rank": {
                    "title": "Rank 1 vs 2",
                    "purpose": "Resolve whether the lower band is minimal discretion or bounded discretion.",
                    "instructions": (
                        "If the case is in the lower band, distinguish rank 1 from rank 2. "
                        "Use rank 1 for narrow, ministerial, procedural, or mechanical authority; use rank 2 for real but bounded authority."
                    ),
                    "outputs": [
                        _field("discretion_rank", "Discretion Rank", "integer", required=True, minimum=1, maximum=2, visibility="final"),
                        _field("discretion_rationale", "Discretion rationale", "string", required=True),
                        _field("boundary_decision", "Boundary decision", "string", required=True),
                    ],
                },
                "high_rank": {
                    "title": "Rank 3 vs 4",
                    "purpose": "Resolve whether the higher band is substantial discretion or the professor's agency-labeled high class.",
                    "instructions": (
                        "If the case is in the higher band, distinguish rank 3 from rank 4. "
                        "Do not assign the top class merely because authority is broad in wording; require genuine policy-shaping leeway."
                    ),
                    "outputs": [
                        _field("discretion_rank", "Discretion Rank", "integer", required=True, minimum=3, maximum=4, visibility="final"),
                        _field("discretion_rationale", "Discretion rationale", "string", required=True),
                        _field("boundary_decision", "Boundary decision", "string", required=True),
                    ],
                },
                "decision": {
                    "title": "Final Rank Decision",
                    "purpose": "Turn the inventory stage into the final ranked discretion judgment.",
                    "instructions": (
                        "Use the provisional rank, residual leeway, and boundary analysis to assign the final rank. "
                        "Prefer the lower rank when evidence is mixed or broad verbs are not supported by real policy choice."
                    ),
                    "outputs": [
                        _field("discretion_rank", "Discretion Rank", "integer", required=True, minimum=1, maximum=4, visibility="final"),
                        _field("discretion_rationale", "Discretion rationale", "string", required=True),
                    ],
                },
                "calibration": {
                    "title": "Optional Calibration",
                    "purpose": "Adjust only boundary cases by one rank when the evidence clearly falls at the lower or upper edge of the provisional class.",
                    "instructions": (
                        "Calibration is optional. Use it only for close boundary cases. "
                        "Do not recalibrate by more than one rank, and do not move upward without clear evidence of broader substantive policy choice."
                    ),
                    "outputs": [
                        _field("discretion_rank", "Discretion Rank", "integer", required=True, minimum=1, maximum=4, visibility="final"),
                        _field("discretion_rationale", "Discretion rationale", "string", required=True),
                        _field("recalibration_summary", "Recalibration summary", "string"),
                    ],
                },
            },
        }
    }


def is_discretion_builder(definition: dict[str, Any] | None) -> bool:
    metadata = (definition or {}).get("metadata") or {}
    builder = metadata.get("builder") or {}
    return builder.get("kind") == BUILDER_KIND


def _copy_outputs(builder: dict[str, Any], stage_key: str) -> list[dict[str, Any]]:
    stages = builder.get("stages") or {}
    stage = stages.get(stage_key) or {}
    return deepcopy(stage.get("outputs") or [])


def _instructions_heading(stage: dict[str, Any], body: str) -> str:
    title = str(stage.get("title") or "").strip()
    purpose = str(stage.get("purpose") or "").strip()
    custom = str(stage.get("instructions") or "").strip()
    parts = []
    if title:
        parts.append(f"Stage: {title}")
    if purpose:
        parts.append(f"Purpose: {purpose}")
    if body:
        parts.append(body.strip())
    if custom:
        parts.append(f"Project-specific guidance:\n{custom}")
    return "\n\n".join(part for part in parts if part).strip()


def _delegation_prompt(stage: dict[str, Any]) -> str:
    body = """
You are coding CQ summaries or statutory law text for a research project on congressional delegation and agency discretion.

Use Prompt_v8 as the delegation gate:
- Code delegate_law = true only when Congress grants new, renewed-with-substantive-change, or materially expanded authority or responsibility to a federal executive or administrative actor.
- Code delegate_law = false when the text does not show meaningful new or materially expanded authority.
- Do not count a mere agency mention, private-party filing requirement, procedural change, exemption, or reduced regulation as delegation by itself.
- Anti-inflation rule: mentioning delegation does not automatically mean delegation applies. Exemptions can constrain regulatory scope rather than expand it.
- If the evidence is ambiguous, choose false unless the text clearly grants meaningful new or materially expanded authority.

Return all configured fields.
"""
    return _instructions_heading(stage, body)


def _inventory_prompt(stage: dict[str, Any]) -> str:
    body = """
Analyze delegated administrative discretion using the professor's cascade method.

Inventory first, judge second, rank last:
1. identify the delegated authority,
2. identify affirmative discretion signals,
3. identify constraint evidence,
4. assess residual leeway after those constraints,
5. assign a provisional rank,
6. explain the key boundary choice.

Anti-inflation rule:
- Do not infer substantial or high discretion merely because the law uses verbs like regulate, determine, approve, exempt, waive, or issue rules.
- Prefer the lower category when the evidence is mixed.

Return only the configured structured fields.
"""
    return _instructions_heading(stage, body)


def _multiclass_prompt(stage: dict[str, Any], calibration_enabled: bool) -> str:
    calibration_note = (
        "\nCalibration module is enabled. If the case is near a boundary, explain the boundary decision and adjust by at most one rank."
        if calibration_enabled
        else "\nCalibration module is disabled. Choose the best direct rank without a separate recalibration step."
    )
    body = f"""
Classify the law into one discretion rank from 1 to 4 using the streamlined M9 multiclass approach.

Rank discipline:
- 1 = minimal discretion
- 2 = bounded discretion
- 3 = substantial discretion
- 4 = high discretion

Use the lower rank when evidence is mixed. Do not inflate the score because authority sounds broad in wording.{calibration_note}

Return only the configured structured fields.
"""
    return _instructions_heading(stage, body)


def _binary_split_prompt(stage: dict[str, Any], high_label: str, low_label: str) -> str:
    body = f"""
Apply the first binary discretion screen.

Classify the law into one of two bands:
- {low_label}: minimal or bounded discretion (ranks 1 or 2)
- {high_label}: substantial or high discretion (ranks 3 or 4)

Do not move into the {high_label} band merely because the law mentions delegation or uses broad verbs. Require real policy-shaping discretion.

Return only the configured structured fields.
"""
    return _instructions_heading(stage, body)


def _adjacent_rank_prompt(stage: dict[str, Any], lower_rank: int, upper_rank: int, label: str) -> str:
    body = f"""
Resolve the adjacent discretion decision for the {label} band.

Return one final discretion_rank:
- {lower_rank}
- {upper_rank}

Use the lower rank when the evidence is mixed or the authority remains materially constrained.
Return only the configured structured fields.
"""
    return _instructions_heading(stage, body)


def _decision_prompt(stage: dict[str, Any]) -> str:
    body = """
Use the inventory outputs to assign the final discretion rank from 1 to 4.

The provisional rank is not automatically final. Weigh affirmative discretion signals, constraint evidence, residual leeway, and the boundary explanation.
Prefer the lower rank when the evidence is mixed or the law leaves meaningful statutory guardrails in place.

Return only the configured structured fields.
"""
    return _instructions_heading(stage, body)


def _calibration_prompt(stage: dict[str, Any]) -> str:
    body = """
Apply the optional calibration review.

Adjust only boundary cases and by at most one rank.
- Lower by one rank if the case clearly falls in the lower edge of its current class.
- Raise by one rank only when there is clear evidence of broader substantive policy choice.
- Do not recalibrate rank 0 upward, and do not move above rank 4.

Return only the configured structured fields.
"""
    return _instructions_heading(stage, body)


def _visible_output_fields(definition: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    metadata = definition.get("metadata") or {}
    builder = metadata.get("builder") or {}
    final_fields: list[dict[str, Any]] = []
    internal_fields: list[dict[str, Any]] = []
    mode = str(builder.get("mode") or "cascade")
    calibration_enabled = bool(builder.get("calibration_enabled"))
    active_stage_keys = {
        "cascade": ["delegation", "inventory", "decision"],
        "multiclass": ["delegation", "multiclass"],
        "binary": ["delegation", "binary_split", "low_rank", "high_rank"],
    }.get(mode, ["delegation", "inventory", "decision"])
    if calibration_enabled:
        active_stage_keys = [*active_stage_keys, "calibration"]

    source_map = {
        "delegate_law": "law_delegation.delegate_law",
        "discretion_rank": "discretion_rank",
        "discretion_rationale": "discretion_rationale",
        "recalibration_summary": "recalibration_review.recalibration_summary",
    }

    for stage_key in active_stage_keys:
        stage = (builder.get("stages") or {}).get(stage_key) or {}
        for output in stage.get("outputs") or []:
            key = output.get("key")
            if not key or key not in source_map:
                continue
            item = {
                "key": key,
                "label": output.get("label") or key,
                "source": source_map[key],
            }
            if output.get("visibility") == "final":
                if item not in final_fields:
                    final_fields.append(item)
            elif item not in internal_fields:
                internal_fields.append(item)
    return final_fields, internal_fields


def compile_workflow_definition(definition: dict[str, Any] | None) -> dict[str, Any]:
    base = deepcopy(definition or {})
    if not is_discretion_builder(base):
        return base

    metadata = base.setdefault("metadata", {})
    builder = metadata.setdefault("builder", default_builder_metadata()["builder"])
    mode = str(builder.get("mode") or "cascade").strip().lower()
    if mode not in {"cascade", "multiclass", "binary"}:
        mode = "cascade"
        builder["mode"] = mode
    calibration_enabled = bool(builder.get("calibration_enabled"))
    source_policy = str(builder.get("source_policy") or "full_text")
    label_overrides = builder.get("label_overrides") or {}
    high_label = str(label_overrides.get("binary_high_class") or "agency").strip() or "agency"
    low_label = str(label_overrides.get("binary_low_class") or "bounded").strip() or "bounded"
    stages = builder.get("stages") or {}

    nodes: list[dict[str, Any]] = [
        {
            "id": "document_input",
            "kind": "document_input",
            "name": "Law file input",
            "description": "The law file text being coded by this research workflow.",
            "position": {"x": 40, "y": 260},
            "config": {"source_policy": source_policy},
        },
        {
            "id": "law_delegation",
            "kind": "llm",
            "name": "Law Delegation feature",
            "description": "Prompt_v8 delegation gate with structured audit outputs.",
            "position": {"x": 340, "y": 260},
            "config": {
                "document_context": "source_text",
                "instructions": _delegation_prompt(stages.get("delegation") or {}),
                "input_fields": [],
                "outputs": _copy_outputs(builder, "delegation"),
            },
        },
        {
            "id": "delegation_gate",
            "kind": "condition",
            "name": "delegate_law = false?",
            "description": "Skip discretion ranking when there is no meaningful delegation.",
            "position": {"x": 690, "y": 260},
            "config": {
                "expression": {
                    "op": "eq",
                    "left": {"field": "law_delegation.delegate_law"},
                    "right": {"literal": False},
                },
                "true_label": "No delegation",
                "false_label": "Delegation found",
            },
        },
        {
            "id": "rank_zero",
            "kind": "set_value",
            "name": "Set discretion_rank = 0",
            "description": "No delegation means no discretion.",
            "position": {"x": 1020, "y": 100},
            "config": {
                "assignments": [
                    {"field": "discretion_rank", "type": "integer", "value": 0},
                    {
                        "field": "discretion_rationale",
                        "type": "string",
                        "value": "No meaningful delegation was identified, so the discretion rank is 0.",
                    },
                ]
            },
        },
    ]
    edges: list[dict[str, Any]] = [
        {"id": "e-input-delegation", "source": "document_input", "target": "law_delegation"},
        {"id": "e-delegation-gate", "source": "law_delegation", "target": "delegation_gate"},
        {"id": "e-gate-zero", "source": "delegation_gate", "target": "rank_zero", "source_handle": "true", "label": "No delegation"},
    ]

    validation_inputs_from: list[str] = ["rank_zero"]
    downstream_start_id: str | None = None

    if mode == "cascade":
        nodes.extend(
            [
                {
                    "id": "discretion_inventory",
                    "kind": "llm",
                    "name": "Discretion Inventory",
                    "description": "Inventory signals, constraints, residual leeway, and a provisional rank.",
                    "position": {"x": 1040, "y": 420},
                    "config": {
                        "document_context": "source_text",
                        "instructions": _inventory_prompt(stages.get("inventory") or {}),
                        "input_fields": [
                            "law_delegation.delegate_law",
                            "law_delegation.delegation_rationale",
                            "law_delegation.administrative_actors",
                            "law_delegation.delegated_authorities",
                            "law_delegation.constraints_summary",
                            "law_delegation.constraint_strength",
                            "law_delegation.delegation_breadth",
                            "law_delegation.delegation_centrality",
                        ],
                        "outputs": _copy_outputs(builder, "inventory"),
                    },
                },
                {
                    "id": "discretion_decision",
                    "kind": "llm",
                    "name": "Final Rank Decision",
                    "description": "Turn the inventory into the final discretion rank.",
                    "position": {"x": 1370, "y": 420},
                    "config": {
                        "document_context": "source_text",
                        "instructions": _decision_prompt(stages.get("decision") or {}),
                        "input_fields": [
                            "law_delegation.delegate_law",
                            "law_delegation.delegation_rationale",
                            "discretion_inventory.delegated_authority_summary",
                            "discretion_inventory.affirmative_discretion_signals",
                            "discretion_inventory.constraint_evidence",
                            "discretion_inventory.residual_leeway",
                            "discretion_inventory.provisional_rank",
                            "discretion_inventory.boundary_decision",
                        ],
                        "outputs": _copy_outputs(builder, "decision"),
                    },
                },
            ]
        )
        edges.extend(
            [
                {"id": "e-gate-inventory", "source": "delegation_gate", "target": "discretion_inventory", "source_handle": "false", "label": "Delegation found"},
                {"id": "e-inventory-decision", "source": "discretion_inventory", "target": "discretion_decision"},
            ]
        )
        validation_inputs_from.append("discretion_decision")
        downstream_start_id = "discretion_decision"
    elif mode == "multiclass":
        nodes.append(
            {
                "id": "discretion_analysis",
                "kind": "llm",
                "name": "Multiclass Discretion Rank",
                "description": "Assign one discretion rank directly with audit signals and constraints.",
                "position": {"x": 1040, "y": 420},
                "config": {
                    "document_context": "source_text",
                    "instructions": _multiclass_prompt(stages.get("multiclass") or {}, calibration_enabled),
                    "input_fields": [
                        "law_delegation.delegate_law",
                        "law_delegation.delegation_rationale",
                        "law_delegation.administrative_actors",
                        "law_delegation.delegated_authorities",
                        "law_delegation.constraints_summary",
                        "law_delegation.constraint_strength",
                        "law_delegation.delegation_breadth",
                        "law_delegation.delegation_centrality",
                    ],
                    "outputs": _copy_outputs(builder, "multiclass"),
                },
            }
        )
        edges.append({"id": "e-gate-multiclass", "source": "delegation_gate", "target": "discretion_analysis", "source_handle": "false", "label": "Delegation found"})
        validation_inputs_from.append("discretion_analysis")
        downstream_start_id = "discretion_analysis"
    else:
        nodes.extend(
            [
                {
                    "id": "binary_split",
                    "kind": "llm",
                    "name": "Binary Split",
                    "description": "Separate the lower bounded band from the professor's agency band.",
                    "position": {"x": 1010, "y": 420},
                    "config": {
                        "document_context": "source_text",
                        "instructions": _binary_split_prompt(stages.get("binary_split") or {}, high_label, low_label),
                        "input_fields": [
                            "law_delegation.delegate_law",
                            "law_delegation.delegation_rationale",
                            "law_delegation.administrative_actors",
                            "law_delegation.delegated_authorities",
                            "law_delegation.constraints_summary",
                            "law_delegation.constraint_strength",
                            "law_delegation.delegation_breadth",
                            "law_delegation.delegation_centrality",
                        ],
                        "outputs": _copy_outputs(builder, "binary_split"),
                    },
                },
                {
                    "id": "binary_gate",
                    "kind": "condition",
                    "name": f"Band = {low_label}?",
                    "description": f"Route the case into the {low_label} or {high_label} adjacent-rank classifier.",
                    "position": {"x": 1310, "y": 420},
                    "config": {
                        "expression": {
                            "op": "eq",
                            "left": {"field": "binary_split.discretion_band"},
                            "right": {"literal": low_label},
                        },
                        "true_label": low_label,
                        "false_label": high_label,
                    },
                },
                {
                    "id": "low_rank_classifier",
                    "kind": "llm",
                    "name": "Rank 1 vs 2",
                    "description": "Resolve whether the lower band is minimal or bounded discretion.",
                    "position": {"x": 1600, "y": 260},
                    "config": {
                        "document_context": "source_text",
                        "instructions": _adjacent_rank_prompt(stages.get("low_rank") or {}, 1, 2, low_label),
                        "input_fields": [
                            "binary_split.discretion_band",
                            "binary_split.band_rationale",
                            "binary_split.affirmative_discretion_signals",
                            "binary_split.constraint_evidence",
                            "law_delegation.constraints_summary",
                        ],
                        "outputs": _copy_outputs(builder, "low_rank"),
                    },
                },
                {
                    "id": "high_rank_classifier",
                    "kind": "llm",
                    "name": "Rank 3 vs 4",
                    "description": "Resolve whether the higher band is substantial discretion or the agency-labeled top class.",
                    "position": {"x": 1600, "y": 570},
                    "config": {
                        "document_context": "source_text",
                        "instructions": _adjacent_rank_prompt(stages.get("high_rank") or {}, 3, 4, high_label),
                        "input_fields": [
                            "binary_split.discretion_band",
                            "binary_split.band_rationale",
                            "binary_split.affirmative_discretion_signals",
                            "binary_split.constraint_evidence",
                            "law_delegation.constraints_summary",
                        ],
                        "outputs": _copy_outputs(builder, "high_rank"),
                    },
                },
            ]
        )
        edges.extend(
            [
                {"id": "e-gate-binary-split", "source": "delegation_gate", "target": "binary_split", "source_handle": "false", "label": "Delegation found"},
                {"id": "e-binary-gate", "source": "binary_split", "target": "binary_gate"},
                {"id": "e-binary-low", "source": "binary_gate", "target": "low_rank_classifier", "source_handle": "true", "label": low_label},
                {"id": "e-binary-high", "source": "binary_gate", "target": "high_rank_classifier", "source_handle": "false", "label": high_label},
            ]
        )
        validation_inputs_from.extend(["low_rank_classifier", "high_rank_classifier"])
        downstream_start_id = None

    calibration_target_id = downstream_start_id
    if calibration_enabled:
        calibration_node = {
            "id": "recalibration_review",
            "kind": "llm",
            "name": "Optional Calibration Review",
            "description": "Adjust only close boundary cases by at most one rank.",
            "position": {"x": 1880 if mode == "binary" else 1690, "y": 420},
            "config": {
                "document_context": "source_text",
                "instructions": _calibration_prompt(stages.get("calibration") or {}),
                "input_fields": [
                    "law_delegation.delegate_law",
                    "discretion_rank",
                    "discretion_rationale",
                    "boundary_decision",
                    "law_delegation.constraints_summary",
                    "law_delegation.constraint_strength",
                ],
                "outputs": _copy_outputs(builder, "calibration"),
            },
        }
        nodes.append(calibration_node)
        if mode == "binary":
            edges.extend(
                [
                    {"id": "e-low-calibration", "source": "low_rank_classifier", "target": "recalibration_review"},
                    {"id": "e-high-calibration", "source": "high_rank_classifier", "target": "recalibration_review"},
                ]
            )
        else:
            assert downstream_start_id is not None
            edges.append({"id": "e-rank-calibration", "source": downstream_start_id, "target": "recalibration_review"})
        validation_inputs_from = ["rank_zero", "recalibration_review"]

    validation_node = {
        "id": "consistency_check",
        "kind": "validation",
        "name": "Consistency check",
        "description": "Ensure the final rank respects the delegation gate and final range.",
        "position": {"x": 2140 if mode == "binary" else 1960, "y": 260},
        "config": {
            "rules": [
                {
                    "name": "No delegation implies rank zero",
                    "expression": {
                        "op": "or",
                        "args": [
                            {"op": "neq", "left": {"field": "law_delegation.delegate_law"}, "right": {"literal": False}},
                            {"op": "eq", "left": {"field": "discretion_rank"}, "right": {"literal": 0}},
                        ],
                    },
                    "severity": "error",
                },
                {
                    "name": "Delegation true implies rank one through four",
                    "expression": {
                        "op": "or",
                        "args": [
                            {"op": "neq", "left": {"field": "law_delegation.delegate_law"}, "right": {"literal": True}},
                            {
                                "op": "and",
                                "args": [
                                    {"op": "gte", "left": {"field": "discretion_rank"}, "right": {"literal": 1}},
                                    {"op": "lte", "left": {"field": "discretion_rank"}, "right": {"literal": 4}},
                                ],
                            },
                        ],
                    },
                    "severity": "error",
                },
            ]
        },
    }
    nodes.append(validation_node)
    for source_id in validation_inputs_from:
        edges.append({"id": f"e-{source_id}-validate", "source": source_id, "target": "consistency_check"})

    final_fields, internal_fields = _visible_output_fields({"metadata": metadata})
    if not final_fields:
        final_fields = [
            {"source": "law_delegation.delegate_law", "key": "delegate_law", "label": "Delegate Law"},
            {"source": "discretion_rank", "key": "discretion_rank", "label": "Discretion Rank"},
        ]
    output_fields = [{"source": item["source"], "key": item["key"], "label": item["label"]} for item in final_fields]
    nodes.append(
        {
            "id": "dashboard_output",
            "kind": "output",
            "name": "Final dashboard outputs",
            "description": "Only final campaign-facing fields are exposed as dashboard columns.",
            "position": {"x": 2400 if mode == "binary" else 2220, "y": 260},
            "config": {"fields": output_fields},
        }
    )
    edges.append({"id": "e-validate-output", "source": "consistency_check", "target": "dashboard_output"})

    compiled_outputs = [{"key": item["key"], "source": item["source"], "group": "Final"} for item in final_fields]
    metadata["builder_summary"] = {
        "mode": mode,
        "calibration_enabled": calibration_enabled,
        "final_outputs": final_fields,
        "internal_outputs": internal_fields,
    }

    base["schema_version"] = 1
    base["nodes"] = nodes
    base["edges"] = edges
    base["outputs"] = compiled_outputs
    base["viewport"] = base.get("viewport") or {"x": 0, "y": 0, "zoom": 0.6}
    return base
