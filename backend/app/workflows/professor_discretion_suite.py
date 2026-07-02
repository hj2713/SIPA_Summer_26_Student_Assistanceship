from __future__ import annotations

from typing import Any


def _llm_node(
    node_id: str,
    name: str,
    description: str,
    x: int,
    y: int,
    instructions: str,
    outputs: list[dict[str, Any]],
    input_fields: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "id": node_id,
        "kind": "llm",
        "name": name,
        "description": description,
        "position": {"x": x, "y": y},
        "config": {
            "document_context": "source_text",
            "instructions": instructions,
            "input_fields": input_fields or [],
            "outputs": outputs,
        },
    }


def _condition_node(
    node_id: str,
    name: str,
    description: str,
    x: int,
    y: int,
    field: str,
    literal: Any,
    true_label: str,
    false_label: str,
) -> dict[str, Any]:
    return {
        "id": node_id,
        "kind": "condition",
        "name": name,
        "description": description,
        "position": {"x": x, "y": y},
        "config": {
            "expression": {
                "op": "eq",
                "left": {"field": field},
                "right": {"literal": literal},
            },
            "true_label": true_label,
            "false_label": false_label,
        },
    }


def _set_node(
    node_id: str,
    name: str,
    description: str,
    x: int,
    y: int,
    assignments: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "id": node_id,
        "kind": "set_value",
        "name": name,
        "description": description,
        "position": {"x": x, "y": y},
        "config": {"assignments": assignments},
    }


def _output_mapping(source: str, key: str, label: str) -> dict[str, Any]:
    return {"source": source, "key": key, "label": label}


DELEGATION_GATE_PROMPT = """Stage: Prompt v8 Delegation Gate

Purpose: Apply the existing benchmark-aligned delegation screen before any discretion workflow begins.

Use Prompt_v8 logic on the supplied law text:
- Code delegate_law = true only when Congress grants new, renewed-with-substantive-change, or materially expanded authority or responsibility to a U.S. federal executive or administrative actor.
- Code delegate_law = false when the text does not show meaningful new or materially expanded authority.
- Do not count a mere agency mention, filing duty, procedural amendment, exemption, reduced regulation, or pre-existing authority as delegation by itself.
- Analyze only the supplied financial-regulation text.
- If the evidence is ambiguous, choose false unless the text clearly grants meaningful new or materially expanded authority.

Return every configured field so later workflow stages can reuse the delegation decision, actors, and supporting details.
"""


INVENTORY_PROMPT = """Stage: Shared Discretion Inventory

Purpose: Convert the professor's discretion framework into reusable structured ingredients before the workflow branches into cascade, multiclass, and binary paths.

Using only the supplied law text and the upstream delegation decision:
1. identify the relevant agency or actor,
2. identify the delegated authority,
3. list affirmative discretion signals,
4. list constraint evidence,
5. assess residual leeway after constraints,
6. summarize why the authority is narrow, bounded, substantial, or broad.

Important rules:
- A mere mention of an agency is not enough.
- Do not infer discretion from background law or general knowledge.
- Do not inflate discretion merely because the statute uses words like regulate, determine, exempt, waive, or issue rules.
- If the evidence is mixed, preserve the lower-discretion interpretation in the inventory summary.

Return only the configured structured fields.
"""


CASCADE_STAGE_2_PROMPT = """Stage: Cascade Stage 2 - Minimal Discretion Screen

Purpose: Recreate the professor's cascade Stage 2 decision as its own workflow step.

Question: after considering the identified constraints, is the remaining discretion below 2?

Answer true only when the delegated role is narrow, mechanical, procedural, ministerial, administrative, or tightly constrained. This includes reporting, transmitting information, applying a clear formula, carrying out a fixed duty, or administering details where Congress already specified the substantive rule.

Burden rule:
- Default to true unless the law clearly shows real agency judgment beyond narrow implementation.

Return:
- cascade_stage2_below_2: boolean
- cascade_stage2_rationale: concise explanation
"""


CASCADE_STAGE_3_PROMPT = """Stage: Cascade Stage 3 - Bounded vs Substantial Screen

Purpose: Recreate the professor's cascade Stage 3 decision as its own workflow step.

Question: after considering the identified constraints, is the remaining discretion below 3?

Answer true when the law delegates real implementation, supervisory, regulatory, enforcement, or administrative authority, but that authority is bounded by significant statutory rules, standards, deadlines, reporting duties, consultation requirements, exemptions, appeals, oversight, approval requirements, or limits on waiver, enforcement, supervision, interpretation, or regulatory scope.

Burden rule:
- Default to true unless the text clearly shows substantial agency choice over policy standards, enforcement priorities, supervisory methods, exemptions, waivers, interpretations, approvals, or regulatory scope.
- Do not move above rank 2 merely because the law gives rulemaking, enforcement, supervisory, or implementation authority.

Return:
- cascade_stage3_below_3: boolean
- cascade_stage3_rationale: concise explanation
"""


CASCADE_STAGE_4_PROMPT = """Stage: Cascade Stage 4 - Substantial vs High Screen

Purpose: Recreate the professor's cascade Stage 4 decision as its own workflow step.

Question: after considering the identified constraints, is the remaining discretion below 4?

Answer true when the law delegates meaningful authority to interpret, implement, enforce, supervise, regulate, approve, waive, exempt, or set standards, but the authority is not broad, central, and weakly constrained enough to qualify as high discretion.

Burden rule:
- Default to true unless the text clearly shows broad, central, weakly constrained policymaking discretion.
- Do not assign rank 4 simply because the law delegates broad authority.

Return:
- cascade_stage4_below_4: boolean
- cascade_stage4_rationale: concise explanation
"""


CASCADE_BOUNDARY_PROMPT = """Stage: Cascade Boundary Review

Purpose: Apply the professor's boundary rules after the workflow has already assigned a provisional rank through explicit stage screens.

Using the shared inventory plus the workflow-derived provisional rank:
- explain the most important boundary choice,
- identify whether the case sits in the lower edge, middle, or upper edge of the provisional rank,
- explain which constraints or discretion signals drive that boundary assessment.

Return:
- cascade_boundary_decision: concise explanation of the boundary call
- cascade_boundary_bucket: one of lower_25, middle_50, upper_25
"""


CASCADE_RECALIBRATION_PROMPT = """Stage: Cascade Recalibration

Purpose: Finish the professor's cascade workflow by turning the provisional rank and boundary review into the final cascade result.

Rules:
- Do not recalibrate by more than one rank.
- Do not move upward unless there is clear evidence of broad substantive policy choice.
- Give weight to statutory criteria, formulas, narrow scope, consultation, reporting, procedural requirements, sunsets, fixed triggers, and defined objectives when considering downward movement.

Return:
- cascade_recalibration: explain whether the provisional rank was kept, lowered, or raised
- cascade_discretion_rank: final cascade discretion rank from 0 to 4
- cascade_decision_rationale: 1-2 sentence final rationale
"""


M9_PROMPT = """Stage: M9 Multiclass Path

Purpose: Run the streamlined professor prompt as a separate single-step multiclass path so it can be compared against the cascade and binary workflows.

Classify the law into one discretion rank from 0 to 4 using the streamlined M9 framing:
- 0 = no delegated discretion
- 1 = minimal discretion
- 2 = bounded discretion
- 3 = substantial discretion
- 4 = high discretion

Rules:
- Use the upstream inventory rather than recomputing everything from scratch.
- Prefer the lower rank when the evidence is mixed.
- Do not inflate the score because authority sounds broad in wording.

Return:
- m9_discretion_rank
- m9_decision_rationale
"""


B3_BAND_PROMPT = """Stage: B3 Binary Coarse Split

Purpose: Run the professor's binary decomposition path by first deciding whether the law belongs in the lower-discretion band or the higher-discretion band.

Classify into one band:
- bounded: minimal or bounded discretion, equivalent to final ranks 1 or 2
- agency: substantial or high discretion, equivalent to final ranks 3 or 4

Rules:
- Do not move into the agency band merely because the law mentions delegation or uses broad verbs.
- Require real policy-shaping discretion before choosing the agency band.

Return:
- b3_discretion_band: bounded or agency
- b3_band_rationale: concise explanation
"""


B3_LOW_PROMPT = """Stage: B3 Low Band Split

Purpose: If the binary path falls into the lower band, decide between rank 1 and rank 2.

Return:
- b3_provisional_rank: 1 or 2
- b3_branch_rationale: concise explanation

Use rank 1 for narrow, ministerial, procedural, or mechanical authority.
Use rank 2 for real but materially bounded authority.
"""


B3_HIGH_PROMPT = """Stage: B3 High Band Split

Purpose: If the binary path falls into the higher band, decide between rank 3 and rank 4.

Return:
- b3_provisional_rank: 3 or 4
- b3_branch_rationale: concise explanation

Use rank 4 only when the law leaves broad, central, weakly constrained policy-shaping authority to the agency.
"""


B3_FINALIZE_PROMPT = """Stage: B3 Finalization

Purpose: Finish the professor's binary workflow by converting the provisional binary-path rank into the final B3 output with an explicit note on whether calibration changed anything.

Rules:
- If the provisional binary-path rank already fits comfortably, keep it.
- If the case sits at a close boundary, calibration may move it by one rank at most.
- Prefer the lower rank when evidence is mixed.

Return:
- b3_recalibration: explain whether the provisional binary-path rank changed
- b3_discretion_rank: final B3 discretion rank from 0 to 4
- b3_decision_rationale: 1-2 sentence final rationale
"""


def professor_discretion_prompt_suite_definition() -> dict[str, Any]:
    nodes = [
        {
            "id": "document_input",
            "kind": "document_input",
            "name": "Law file input",
            "description": "Full law text or law-level summary passed from the campaign into the workflow.",
            "position": {"x": 40, "y": 640},
            "config": {"source_policy": "full_text"},
        },
        _llm_node(
            "delegation_gate",
            "Prompt v8 Delegation Gate",
            "Stage 1 benchmark-aligned delegation screen. This decides whether any discretion path should run at all.",
            320,
            640,
            DELEGATION_GATE_PROMPT,
            [
                {"key": "delegate_law", "label": "Delegate Law", "type": "boolean", "required": True},
                {"key": "delegation_rationale", "label": "Delegation rationale", "type": "string", "required": True},
                {"key": "agency_or_actor", "label": "Agency or actor", "type": "list[string]", "required": False},
                {"key": "delegated_authority", "label": "Delegated authority", "type": "list[string]", "required": False},
            ],
        ),
        _condition_node(
            "delegation_exists",
            "Delegation found?",
            "Branch the workflow so we only run discretion prompts when the law actually delegates authority.",
            610,
            640,
            "delegation_gate.delegate_law",
            False,
            "No delegation",
            "Delegation found",
        ),
        _set_node(
            "no_delegation_defaults",
            "Set no-delegation outputs",
            "If delegation is absent, set every prompt-family output to rank 0 and stop the discretion paths.",
            900,
            180,
            [
                {"field": "cascade_stage_reached", "type": "integer", "value": 1},
                {"field": "cascade_provisional_rank", "type": "integer", "value": 0},
                {"field": "cascade_discretion_rank", "type": "integer", "value": 0},
                {"field": "cascade_boundary_decision", "type": "string", "value": "Stopped after the delegation screen because no meaningful delegated authority was identified."},
                {"field": "cascade_recalibration", "type": "string", "value": "Not applicable because no delegation was identified."},
                {"field": "cascade_decision_rationale", "type": "string", "value": "No delegated authority was identified, so the cascade path assigns discretion rank 0."},
                {"field": "m9_discretion_rank", "type": "integer", "value": 0},
                {"field": "m9_decision_rationale", "type": "string", "value": "No delegated authority was identified, so the M9 path assigns discretion rank 0."},
                {"field": "b3_discretion_band", "type": "string", "value": "no_delegation"},
                {"field": "b3_band_rationale", "type": "string", "value": "The binary path stopped because no meaningful delegated authority was identified."},
                {"field": "b3_provisional_rank", "type": "integer", "value": 0},
                {"field": "b3_recalibration", "type": "string", "value": "Not applicable because no delegation was identified."},
                {"field": "b3_discretion_rank", "type": "integer", "value": 0},
                {"field": "b3_decision_rationale", "type": "string", "value": "No delegated authority was identified, so the binary path assigns discretion rank 0."},
            ],
        ),
        _llm_node(
            "shared_inventory",
            "Shared Discretion Inventory",
            "Translate the prompt family into reusable structured ingredients: authority, signals, constraints, and residual leeway.",
            920,
            640,
            INVENTORY_PROMPT,
            [
                {"key": "inventory_agency_or_actor", "label": "Inventory agency or actor", "type": "list[string]", "required": False},
                {"key": "inventory_delegated_authority", "label": "Inventory delegated authority", "type": "list[string]", "required": False},
                {"key": "inventory_affirmative_discretion_signals", "label": "Affirmative discretion signals", "type": "list[string]", "required": False},
                {"key": "inventory_constraint_evidence", "label": "Constraint evidence", "type": "list[string]", "required": False},
                {"key": "inventory_residual_leeway", "label": "Residual leeway", "type": "enum", "options": ["None", "Low", "Bounded", "Substantial", "High"], "required": True},
                {"key": "inventory_summary", "label": "Inventory summary", "type": "string", "required": True},
            ],
            [
                "delegation_gate.delegate_law",
                "delegation_gate.delegation_rationale",
                "delegation_gate.agency_or_actor",
                "delegation_gate.delegated_authority",
            ],
        ),
        _llm_node(
            "cascade_stage2_screen",
            "Cascade Stage 2 Screen",
            "Ask the professor's Stage 2 question directly: is the remaining discretion below rank 2?",
            1230,
            420,
            CASCADE_STAGE_2_PROMPT,
            [
                {"key": "cascade_stage2_below_2", "label": "Cascade stage 2 below 2", "type": "boolean", "required": True},
                {"key": "cascade_stage2_rationale", "label": "Cascade stage 2 rationale", "type": "string", "required": True},
            ],
            [
                "shared_inventory.inventory_agency_or_actor",
                "shared_inventory.inventory_delegated_authority",
                "shared_inventory.inventory_affirmative_discretion_signals",
                "shared_inventory.inventory_constraint_evidence",
                "shared_inventory.inventory_residual_leeway",
                "shared_inventory.inventory_summary",
            ],
        ),
        _condition_node(
            "cascade_stage2_branch",
            "Cascade below 2?",
            "If yes, the cascade provisional rank is 1. If no, continue to the Stage 3 screen.",
            1520,
            420,
            "cascade_stage2_screen.cascade_stage2_below_2",
            True,
            "Rank 1",
            "Continue to stage 3",
        ),
        _set_node(
            "cascade_rank1_provisional",
            "Set cascade provisional rank 1",
            "The workflow reached Stage 2 and stopped because the law fits minimal discretion.",
            1810,
            260,
            [
                {"field": "cascade_stage_reached", "type": "integer", "value": 2},
                {"field": "cascade_provisional_rank", "type": "integer", "value": 1},
            ],
        ),
        _llm_node(
            "cascade_stage3_screen",
            "Cascade Stage 3 Screen",
            "Ask the professor's Stage 3 question directly: is the remaining discretion below rank 3?",
            1810,
            520,
            CASCADE_STAGE_3_PROMPT,
            [
                {"key": "cascade_stage3_below_3", "label": "Cascade stage 3 below 3", "type": "boolean", "required": True},
                {"key": "cascade_stage3_rationale", "label": "Cascade stage 3 rationale", "type": "string", "required": True},
            ],
            [
                "shared_inventory.inventory_agency_or_actor",
                "shared_inventory.inventory_delegated_authority",
                "shared_inventory.inventory_affirmative_discretion_signals",
                "shared_inventory.inventory_constraint_evidence",
                "shared_inventory.inventory_residual_leeway",
                "shared_inventory.inventory_summary",
                "cascade_stage2_screen.cascade_stage2_rationale",
            ],
        ),
        _condition_node(
            "cascade_stage3_branch",
            "Cascade below 3?",
            "If yes, the cascade provisional rank is 2. If no, continue to the Stage 4 screen.",
            2100,
            520,
            "cascade_stage3_screen.cascade_stage3_below_3",
            True,
            "Rank 2",
            "Continue to stage 4",
        ),
        _set_node(
            "cascade_rank2_provisional",
            "Set cascade provisional rank 2",
            "The workflow reached Stage 3 and stopped because the law fits bounded discretion.",
            2390,
            380,
            [
                {"field": "cascade_stage_reached", "type": "integer", "value": 3},
                {"field": "cascade_provisional_rank", "type": "integer", "value": 2},
            ],
        ),
        _llm_node(
            "cascade_stage4_screen",
            "Cascade Stage 4 Screen",
            "Ask the professor's Stage 4 question directly: is the remaining discretion below rank 4?",
            2390,
            640,
            CASCADE_STAGE_4_PROMPT,
            [
                {"key": "cascade_stage4_below_4", "label": "Cascade stage 4 below 4", "type": "boolean", "required": True},
                {"key": "cascade_stage4_rationale", "label": "Cascade stage 4 rationale", "type": "string", "required": True},
            ],
            [
                "shared_inventory.inventory_agency_or_actor",
                "shared_inventory.inventory_delegated_authority",
                "shared_inventory.inventory_affirmative_discretion_signals",
                "shared_inventory.inventory_constraint_evidence",
                "shared_inventory.inventory_residual_leeway",
                "shared_inventory.inventory_summary",
                "cascade_stage3_screen.cascade_stage3_rationale",
            ],
        ),
        _condition_node(
            "cascade_stage4_branch",
            "Cascade below 4?",
            "If yes, the cascade provisional rank is 3. If no, it becomes 4.",
            2680,
            640,
            "cascade_stage4_screen.cascade_stage4_below_4",
            True,
            "Rank 3",
            "Rank 4",
        ),
        _set_node(
            "cascade_rank3_provisional",
            "Set cascade provisional rank 3",
            "The workflow reached Stage 4 and classified the law as substantial rather than high discretion.",
            2970,
            520,
            [
                {"field": "cascade_stage_reached", "type": "integer", "value": 4},
                {"field": "cascade_provisional_rank", "type": "integer", "value": 3},
            ],
        ),
        _set_node(
            "cascade_rank4_provisional",
            "Set cascade provisional rank 4",
            "The workflow reached Stage 4 and classified the law as high discretion.",
            2970,
            760,
            [
                {"field": "cascade_stage_reached", "type": "integer", "value": 4},
                {"field": "cascade_provisional_rank", "type": "integer", "value": 4},
            ],
        ),
        _llm_node(
            "cascade_boundary_review",
            "Cascade Boundary Review",
            "Apply the prompt's explicit 1-vs-2, 2-vs-3, and 3-vs-4 boundary rules after the provisional rank path is known.",
            3260,
            620,
            CASCADE_BOUNDARY_PROMPT,
            [
                {"key": "cascade_boundary_decision", "label": "Cascade boundary decision", "type": "string", "required": True},
                {"key": "cascade_boundary_bucket", "label": "Cascade boundary bucket", "type": "enum", "options": ["lower_25", "middle_50", "upper_25"], "required": True},
            ],
            [
                "shared_inventory.inventory_affirmative_discretion_signals",
                "shared_inventory.inventory_constraint_evidence",
                "shared_inventory.inventory_residual_leeway",
                "shared_inventory.inventory_summary",
                "cascade_provisional_rank",
                "cascade_stage2_screen.cascade_stage2_rationale",
                "cascade_stage3_screen.cascade_stage3_rationale",
                "cascade_stage4_screen.cascade_stage4_rationale",
            ],
        ),
        _llm_node(
            "cascade_recalibration",
            "Cascade Recalibration",
            "Apply the prompt's recalibration rule after the workflow has already determined stage reached, provisional rank, and boundary position.",
            3550,
            620,
            CASCADE_RECALIBRATION_PROMPT,
            [
                {"key": "cascade_recalibration", "label": "Cascade recalibration", "type": "string", "required": True},
                {"key": "cascade_discretion_rank", "label": "Cascade discretion rank", "type": "integer", "minimum": 0, "maximum": 4, "required": True},
                {"key": "cascade_decision_rationale", "label": "Cascade decision rationale", "type": "string", "required": True},
            ],
            [
                "cascade_stage_reached",
                "cascade_provisional_rank",
                "shared_inventory.inventory_affirmative_discretion_signals",
                "shared_inventory.inventory_constraint_evidence",
                "shared_inventory.inventory_residual_leeway",
                "cascade_boundary_review.cascade_boundary_decision",
                "cascade_boundary_review.cascade_boundary_bucket",
            ],
        ),
        _llm_node(
            "m9_multiclass",
            "M9 Multiclass Path",
            "Run the streamlined multiclass prompt as a separate direct path using the shared inventory.",
            1230,
            980,
            M9_PROMPT,
            [
                {"key": "m9_discretion_rank", "label": "M9 discretion rank", "type": "integer", "minimum": 0, "maximum": 4, "required": True},
                {"key": "m9_decision_rationale", "label": "M9 decision rationale", "type": "string", "required": True},
            ],
            [
                "delegation_gate.delegate_law",
                "shared_inventory.inventory_agency_or_actor",
                "shared_inventory.inventory_delegated_authority",
                "shared_inventory.inventory_affirmative_discretion_signals",
                "shared_inventory.inventory_constraint_evidence",
                "shared_inventory.inventory_residual_leeway",
                "shared_inventory.inventory_summary",
            ],
        ),
        _llm_node(
            "b3_band_screen",
            "B3 Coarse Band Screen",
            "Run the binary decomposition path by first splitting the law into the bounded band or the agency band.",
            1230,
            1320,
            B3_BAND_PROMPT,
            [
                {"key": "b3_discretion_band", "label": "B3 discretion band", "type": "string", "required": True},
                {"key": "b3_band_rationale", "label": "B3 band rationale", "type": "string", "required": True},
            ],
            [
                "delegation_gate.delegate_law",
                "shared_inventory.inventory_agency_or_actor",
                "shared_inventory.inventory_delegated_authority",
                "shared_inventory.inventory_affirmative_discretion_signals",
                "shared_inventory.inventory_constraint_evidence",
                "shared_inventory.inventory_residual_leeway",
                "shared_inventory.inventory_summary",
            ],
        ),
        _condition_node(
            "b3_band_branch",
            "B3 bounded band?",
            "If the coarse band is bounded, split 1 vs 2. Otherwise split 3 vs 4.",
            1520,
            1320,
            "b3_band_screen.b3_discretion_band",
            "bounded",
            "Bounded band",
            "Agency band",
        ),
        _llm_node(
            "b3_low_band",
            "B3 Low Band Split",
            "Resolve 1 vs 2 after the coarse binary screen has already placed the law in the lower band.",
            1810,
            1180,
            B3_LOW_PROMPT,
            [
                {"key": "b3_provisional_rank", "label": "B3 provisional rank", "type": "integer", "minimum": 1, "maximum": 2, "required": True},
                {"key": "b3_branch_rationale", "label": "B3 branch rationale", "type": "string", "required": True},
            ],
            [
                "b3_band_screen.b3_discretion_band",
                "b3_band_screen.b3_band_rationale",
                "shared_inventory.inventory_affirmative_discretion_signals",
                "shared_inventory.inventory_constraint_evidence",
                "shared_inventory.inventory_residual_leeway",
                "shared_inventory.inventory_summary",
            ],
        ),
        _llm_node(
            "b3_high_band",
            "B3 High Band Split",
            "Resolve 3 vs 4 after the coarse binary screen has already placed the law in the higher band.",
            1810,
            1460,
            B3_HIGH_PROMPT,
            [
                {"key": "b3_provisional_rank", "label": "B3 provisional rank", "type": "integer", "minimum": 3, "maximum": 4, "required": True},
                {"key": "b3_branch_rationale", "label": "B3 branch rationale", "type": "string", "required": True},
            ],
            [
                "b3_band_screen.b3_discretion_band",
                "b3_band_screen.b3_band_rationale",
                "shared_inventory.inventory_affirmative_discretion_signals",
                "shared_inventory.inventory_constraint_evidence",
                "shared_inventory.inventory_residual_leeway",
                "shared_inventory.inventory_summary",
            ],
        ),
        _llm_node(
            "b3_finalize",
            "B3 Finalization",
            "Finish the binary path by applying optional calibration logic to the provisional 1/2 or 3/4 branch decision. Use the populated low-band or high-band branch outputs and ignore the empty branch.",
            2100,
            1320,
            B3_FINALIZE_PROMPT,
            [
                {"key": "b3_recalibration", "label": "B3 recalibration", "type": "string", "required": True},
                {"key": "b3_discretion_rank", "label": "B3 discretion rank", "type": "integer", "minimum": 0, "maximum": 4, "required": True},
                {"key": "b3_decision_rationale", "label": "B3 decision rationale", "type": "string", "required": True},
            ],
            [
                "b3_band_screen.b3_discretion_band",
                "b3_band_screen.b3_band_rationale",
                "b3_low_band.b3_provisional_rank",
                "b3_low_band.b3_branch_rationale",
                "b3_high_band.b3_provisional_rank",
                "b3_high_band.b3_branch_rationale",
                "shared_inventory.inventory_affirmative_discretion_signals",
                "shared_inventory.inventory_constraint_evidence",
                "shared_inventory.inventory_residual_leeway",
            ],
        ),
        {
            "id": "consistency_check",
            "kind": "validation",
            "name": "Prompt Family Consistency Check",
            "description": "Ensure every path respects the delegation gate and produces ranks within valid ranges.",
            "position": {"x": 3850, "y": 860},
            "config": {
                "rules": [
                    {
                        "name": "No delegation implies cascade rank zero",
                        "expression": {
                            "op": "or",
                            "args": [
                                {"op": "neq", "left": {"field": "delegation_gate.delegate_law"}, "right": {"literal": False}},
                                {"op": "eq", "left": {"field": "cascade_discretion_rank"}, "right": {"literal": 0}},
                            ],
                        },
                        "severity": "error",
                    },
                    {
                        "name": "No delegation implies m9 rank zero",
                        "expression": {
                            "op": "or",
                            "args": [
                                {"op": "neq", "left": {"field": "delegation_gate.delegate_law"}, "right": {"literal": False}},
                                {"op": "eq", "left": {"field": "m9_discretion_rank"}, "right": {"literal": 0}},
                            ],
                        },
                        "severity": "error",
                    },
                    {
                        "name": "No delegation implies b3 rank zero",
                        "expression": {
                            "op": "or",
                            "args": [
                                {"op": "neq", "left": {"field": "delegation_gate.delegate_law"}, "right": {"literal": False}},
                                {"op": "eq", "left": {"field": "b3_discretion_rank"}, "right": {"literal": 0}},
                            ],
                        },
                        "severity": "error",
                    },
                ],
            },
        },
        {
            "id": "dashboard_output",
            "kind": "output",
            "name": "Professor prompt suite outputs",
            "description": "Expose the full prompt-family output set so the resulting dashboard shows the shared inventory and every path's final results.",
            "position": {"x": 4140, "y": 860},
            "config": {
                "fields": [
                    _output_mapping("delegation_gate.delegate_law", "delegate_law", "Delegate Law"),
                    _output_mapping("delegation_gate.delegation_rationale", "delegation_rationale", "Delegation Rationale"),
                    _output_mapping("delegation_gate.agency_or_actor", "delegation_gate_agency_or_actor", "Delegation Gate Agency or Actor"),
                    _output_mapping("delegation_gate.delegated_authority", "delegation_gate_delegated_authority", "Delegation Gate Delegated Authority"),
                    _output_mapping("shared_inventory.inventory_agency_or_actor", "inventory_agency_or_actor", "Inventory Agency or Actor"),
                    _output_mapping("shared_inventory.inventory_delegated_authority", "inventory_delegated_authority", "Inventory Delegated Authority"),
                    _output_mapping("shared_inventory.inventory_affirmative_discretion_signals", "inventory_affirmative_discretion_signals", "Inventory Affirmative Discretion Signals"),
                    _output_mapping("shared_inventory.inventory_constraint_evidence", "inventory_constraint_evidence", "Inventory Constraint Evidence"),
                    _output_mapping("shared_inventory.inventory_residual_leeway", "inventory_residual_leeway", "Inventory Residual Leeway"),
                    _output_mapping("shared_inventory.inventory_summary", "inventory_summary", "Inventory Summary"),
                    _output_mapping("cascade_stage_reached", "cascade_stage_reached", "Cascade Stage Reached"),
                    _output_mapping("cascade_stage2_screen.cascade_stage2_below_2", "cascade_stage2_below_2", "Cascade Stage 2 Below 2"),
                    _output_mapping("cascade_stage2_screen.cascade_stage2_rationale", "cascade_stage2_rationale", "Cascade Stage 2 Rationale"),
                    _output_mapping("cascade_stage3_screen.cascade_stage3_below_3", "cascade_stage3_below_3", "Cascade Stage 3 Below 3"),
                    _output_mapping("cascade_stage3_screen.cascade_stage3_rationale", "cascade_stage3_rationale", "Cascade Stage 3 Rationale"),
                    _output_mapping("cascade_stage4_screen.cascade_stage4_below_4", "cascade_stage4_below_4", "Cascade Stage 4 Below 4"),
                    _output_mapping("cascade_stage4_screen.cascade_stage4_rationale", "cascade_stage4_rationale", "Cascade Stage 4 Rationale"),
                    _output_mapping("cascade_provisional_rank", "cascade_provisional_rank", "Cascade Provisional Rank"),
                    _output_mapping("shared_inventory.inventory_agency_or_actor", "cascade_agency_or_actor", "Cascade Agency or Actor"),
                    _output_mapping("shared_inventory.inventory_delegated_authority", "cascade_delegated_authority", "Cascade Delegated Authority"),
                    _output_mapping("shared_inventory.inventory_affirmative_discretion_signals", "cascade_affirmative_discretion_signals", "Cascade Affirmative Discretion Signals"),
                    _output_mapping("shared_inventory.inventory_constraint_evidence", "cascade_constraint_evidence", "Cascade Constraint Evidence"),
                    _output_mapping("shared_inventory.inventory_residual_leeway", "cascade_residual_leeway", "Cascade Residual Leeway"),
                    _output_mapping("cascade_boundary_decision", "cascade_boundary_decision", "Cascade Boundary Decision"),
                    _output_mapping("cascade_recalibration", "cascade_recalibration", "Cascade Recalibration"),
                    _output_mapping("cascade_discretion_rank", "cascade_discretion_rank", "Cascade Discretion Rank"),
                    _output_mapping("cascade_decision_rationale", "cascade_decision_rationale", "Cascade Decision Rationale"),
                    _output_mapping("m9_discretion_rank", "m9_discretion_rank", "M9 Discretion Rank"),
                    _output_mapping("m9_decision_rationale", "m9_decision_rationale", "M9 Decision Rationale"),
                    _output_mapping("b3_discretion_band", "b3_discretion_band", "B3 Discretion Band"),
                    _output_mapping("b3_band_rationale", "b3_band_rationale", "B3 Band Rationale"),
                    _output_mapping("b3_provisional_rank", "b3_provisional_rank", "B3 Provisional Rank"),
                    _output_mapping("b3_branch_rationale", "b3_branch_rationale", "B3 Branch Rationale"),
                    _output_mapping("b3_recalibration", "b3_recalibration", "B3 Recalibration"),
                    _output_mapping("b3_discretion_rank", "b3_discretion_rank", "B3 Discretion Rank"),
                    _output_mapping("b3_decision_rationale", "b3_decision_rationale", "B3 Decision Rationale"),
                ],
            },
        },
    ]

    edges = [
        {"id": "e-input-delegation", "source": "document_input", "target": "delegation_gate"},
        {"id": "e-delegation-branch", "source": "delegation_gate", "target": "delegation_exists"},
        {"id": "e-no-delegation-defaults", "source": "delegation_exists", "target": "no_delegation_defaults", "source_handle": "true", "label": "No delegation"},
        {"id": "e-delegation-inventory", "source": "delegation_exists", "target": "shared_inventory", "source_handle": "false", "label": "Delegation found"},
        {"id": "e-inventory-cascade2", "source": "shared_inventory", "target": "cascade_stage2_screen"},
        {"id": "e-cascade2-branch", "source": "cascade_stage2_screen", "target": "cascade_stage2_branch"},
        {"id": "e-cascade2-rank1", "source": "cascade_stage2_branch", "target": "cascade_rank1_provisional", "source_handle": "true", "label": "Rank 1"},
        {"id": "e-cascade2-stage3", "source": "cascade_stage2_branch", "target": "cascade_stage3_screen", "source_handle": "false", "label": "Continue"},
        {"id": "e-cascade3-branch", "source": "cascade_stage3_screen", "target": "cascade_stage3_branch"},
        {"id": "e-cascade3-rank2", "source": "cascade_stage3_branch", "target": "cascade_rank2_provisional", "source_handle": "true", "label": "Rank 2"},
        {"id": "e-cascade3-stage4", "source": "cascade_stage3_branch", "target": "cascade_stage4_screen", "source_handle": "false", "label": "Continue"},
        {"id": "e-cascade4-branch", "source": "cascade_stage4_screen", "target": "cascade_stage4_branch"},
        {"id": "e-cascade4-rank3", "source": "cascade_stage4_branch", "target": "cascade_rank3_provisional", "source_handle": "true", "label": "Rank 3"},
        {"id": "e-cascade4-rank4", "source": "cascade_stage4_branch", "target": "cascade_rank4_provisional", "source_handle": "false", "label": "Rank 4"},
        {"id": "e-rank1-boundary", "source": "cascade_rank1_provisional", "target": "cascade_boundary_review"},
        {"id": "e-rank2-boundary", "source": "cascade_rank2_provisional", "target": "cascade_boundary_review"},
        {"id": "e-rank3-boundary", "source": "cascade_rank3_provisional", "target": "cascade_boundary_review"},
        {"id": "e-rank4-boundary", "source": "cascade_rank4_provisional", "target": "cascade_boundary_review"},
        {"id": "e-boundary-recalibration", "source": "cascade_boundary_review", "target": "cascade_recalibration"},
        {"id": "e-inventory-m9", "source": "shared_inventory", "target": "m9_multiclass"},
        {"id": "e-inventory-b3-band", "source": "shared_inventory", "target": "b3_band_screen"},
        {"id": "e-b3-band-branch", "source": "b3_band_screen", "target": "b3_band_branch"},
        {"id": "e-b3-low", "source": "b3_band_branch", "target": "b3_low_band", "source_handle": "true", "label": "Bounded band"},
        {"id": "e-b3-high", "source": "b3_band_branch", "target": "b3_high_band", "source_handle": "false", "label": "Agency band"},
        {"id": "e-b3-low-finalize", "source": "b3_low_band", "target": "b3_finalize"},
        {"id": "e-b3-high-finalize", "source": "b3_high_band", "target": "b3_finalize"},
        {"id": "e-defaults-validate", "source": "no_delegation_defaults", "target": "consistency_check"},
        {"id": "e-cascade-validate", "source": "cascade_recalibration", "target": "consistency_check"},
        {"id": "e-m9-validate", "source": "m9_multiclass", "target": "consistency_check"},
        {"id": "e-b3-validate", "source": "b3_finalize", "target": "consistency_check"},
        {"id": "e-validate-output", "source": "consistency_check", "target": "dashboard_output"},
    ]

    outputs = [
        {"key": "delegate_law", "source": "delegation_gate.delegate_law", "group": "Delegation"},
        {"key": "delegation_rationale", "source": "delegation_gate.delegation_rationale", "group": "Delegation"},
        {"key": "inventory_summary", "source": "shared_inventory.inventory_summary", "group": "Inventory"},
        {"key": "cascade_discretion_rank", "source": "cascade_discretion_rank", "group": "Cascade"},
        {"key": "m9_discretion_rank", "source": "m9_discretion_rank", "group": "M9"},
        {"key": "b3_discretion_rank", "source": "b3_discretion_rank", "group": "B3"},
    ]

    return {
        "schema_version": 1,
        "nodes": nodes,
        "edges": edges,
        "outputs": outputs,
        "viewport": {"x": 0, "y": 0, "zoom": 0.32},
        "metadata": {
            "workflow_family": "professor_discretion_prompt_suite",
            "source_prompt_files": [
                "Updates/new prompts/AI_EPR_Discretion_Cascade_Prompt8_v2.txt",
                "Updates/new prompts/m9.txt",
                "Updates/new prompts/b3.txt",
                "Updates/Prompts/Prompt_v8.txt",
            ],
        },
    }
