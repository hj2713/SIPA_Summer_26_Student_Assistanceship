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
    *,
    prompt_provenance: dict[str, Any] | None = None,
) -> dict[str, Any]:
    node: dict[str, Any] = {
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
    if prompt_provenance:
        node["prompt_provenance"] = prompt_provenance
    return node


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


def _validation_node(
    node_id: str,
    name: str,
    description: str,
    x: int,
    y: int,
    rules: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "id": node_id,
        "kind": "validation",
        "name": name,
        "description": description,
        "position": {"x": x, "y": y},
        "config": {"rules": rules},
    }


def _output_field(source: str, key: str, label: str) -> dict[str, Any]:
    return {"source": source, "key": key, "label": label}


def _workflow_output(source: str, key: str, group: str) -> dict[str, Any]:
    return {"source": source, "key": key, "group": group}


def _prov(source_file: str, sections: list[str], adaptation_type: str) -> dict[str, Any]:
    return {
        "source_file": source_file,
        "source_sections": sections,
        "adaptation_type": adaptation_type,
    }


PROMPT_V8_DELEGATION_GATE = """# Prompt Version 8: Benchmark-Aligned Stage 1 Delegation Coding

You are coding CQ Almanac summaries of financial regulation laws for a research project on congressional delegation and agency discretion.

The goal of this prompt is to match the manual benchmark coding. The manual benchmark was based on CQ summaries or major-provisions text, not full statutory text. The workflow may pass a law-level summary or statutory text, but you must still apply the same benchmark-aligned definition and conservatism. Analyze only the supplied financial-regulation text.

## Coding Task

Classify whether the supplied text contains a meaningful delegation of authority to a U.S. federal executive or administrative actor.

## Core Definition

Delegation means Congress gives a U.S. federal agency, independent commission, executive branch actor, the President, or another administrative actor new or materially expanded authority or responsibility to act in implementing, administering, enforcing, supervising, regulating, interpreting, approving, denying, waiving, exempting, investigating, issuing rules, setting standards, making determinations, or carrying out statutory responsibilities.

Code delegate_law = true only when the supplied text says that Congress grants new, renewed-with-substantive-change, or materially expanded authority or responsibility to an executive or administrative actor.

Code delegate_law = false when the supplied text does not show a meaningful new or materially expanded administrative authority.

## Benchmark Alignment Rules

Do not count the following as delegation by themselves:

1. A mere mention of an agency, commission, department, bureau, regulator, or executive actor.
2. A requirement that private parties file documents with, register with, report to, or deliver materials to an agency, unless the text also says the agency receives meaningful authority to approve, deny, exempt, enforce, regulate, set standards, or make discretionary determinations.
3. Technical, conforming, clarifying, or procedural amendments to an existing statute when the text does not describe a new or materially expanded agency power.
4. Simplification, relaxation, reduction, or removal of existing regulatory requirements.
5. A statement that an agency already had authority under existing law.
6. Legislative history, committee process, hearings, testimony, debate, background discussion, or statements of purpose.
7. Authority found only in unrelated non-financial portions of an omnibus law.

If the text says the law removes provisions because an agency already had the authority necessary under existing law, that is evidence against new delegation unless another part of the supplied text clearly grants new or materially expanded authority.

When the evidence is ambiguous, choose delegate_law = false unless the supplied text clearly states that Congress grants meaningful new or materially expanded administrative authority.

## Financial Regulation Scope Rule

For omnibus laws, analyze only the supplied text concerning financial regulation.

Financial regulation includes securities markets, securities exchanges, broker-dealers, investment advisers, investment companies, public companies, disclosure, securities registration, investor protection, commodities markets, banking, thrifts, credit unions, deposit insurance, bank supervision, consumer credit, payment systems, financial institutions, financial markets, financial stability, systemic risk, capital or liquidity requirements, insurance regulation connected to financial risk or solvency, and federal financial regulators such as Treasury, the Federal Reserve, SEC, CFTC, FDIC, OCC, CFPB, and NCUA acting in a regulatory, supervisory, enforcement, or administrative capacity.

Do not code delegation found only in unrelated topics such as agriculture, health, education, defense, transportation, immigration, labor, housing, urban development, or other non-financial subjects.

## Positive Signals for DelegateLaw = Y

Code Y when the supplied text states that the law gives an administrative actor authority such as:

1. issuing rules, regulations, standards, exemptions, waivers, approvals, orders, or determinations;
2. enforcing, supervising, examining, investigating, disciplining, or sanctioning regulated actors;
3. approving, denying, restricting, canceling, suspending, or revoking registrations, licenses, applications, transactions, market access, or institutional actions;
4. administering a new or materially changed regulatory program;
5. setting limits, requirements, rates, reserve levels, disclosure obligations, compliance rules, or market structure rules.

## Negative Signals for DelegateLaw = N

Code N when the supplied text primarily describes:

1. changes to statutory definitions or private-party obligations without meaningful agency action;
2. reduced waiting periods, filing periods, delivery periods, or procedural burdens;
3. allowing regulated parties to use a different filing or registration procedure without giving the agency new discretion;
4. preserving existing regulatory structure without a new or materially expanded agency role;
5. leaving an existing threshold, exemption, or requirement unchanged;
6. removing language because the agency already has sufficient authority.

## Output Format

Return only the following fields:
- delegate_law: boolean
- delegation_rationale: concise explanation of why the gate is true or false
- delegation_evidence: list[string] with short text snippets or paraphrased support from the supplied text
"""


DISCRETION_SHARED_CONTEXT = """# Discretion Classification Context

You are coding a financial regulation law for delegated administrative discretion.

The input is a law-level summary or statutory text. Code only the text supplied. Do not infer authority from background law, legislative history, or general knowledge unless the supplied text expressly incorporates it. Analyze only financial-regulation portions of the supplied text.

Use this sequence: inventory first, judge second, rank last. First identify delegation. Second identify affirmative discretion signals. Third identify the delegated authority. Fourth identify constraints on that authority. Fifth assess residual agency leeway after constraints.

## Definitions

Delegation means the law gives a U.S. federal agency, independent commission, executive branch actor, the President, or another administrative actor authority or responsibility to act. Delegated authority may include authority to implement, administer, enforce, supervise, regulate, interpret, approve, deny, waive, exempt, investigate, issue rules, set standards, make determinations, or carry out statutory responsibilities.

Discretion means the delegated actor has room to choose policy, standards, enforcement priorities, exemptions, interpretations, approvals, waivers, supervision methods, implementation details, or regulatory scope.

Constraint means the law limits, channels, reviews, conditions, or structures the use of delegated authority. Constraints include reporting requirements; consultation requirements; substantive standards; rulemaking procedures, findings, or deadlines; spending limits; time limits or sunset provisions; exemptions limiting scope; appeals procedures; direct oversight; public hearing requirements; approval requirements; and limits on waiver, exemption, enforcement, supervisory, or interpretive authority.

A mere mention of an agency is not delegation unless the law gives that agency authority or responsibility to act. A mandatory ministerial duty may count as delegation, but usually implies low discretion. A rulemaking command counts as delegation. It counts as a constraint only if the law also provides substantive standards, required procedures, deadlines, findings, consultation duties, approval requirements, review mechanisms, or limits on rulemaking authority.

If evidence is ambiguous, choose the lower discretion category unless the supplied text clearly supports the higher category.
"""


AFFIRMATIVE_SIGNALS_TEXT = """## Affirmative discretion signals

Identify statutory features that increase agency discretion. Consider whether the law gives the agency authority to set substantive standards or rules; choose among policy alternatives; define eligibility, scope, thresholds, or compliance obligations; grant, deny, waive, exempt, approve, condition, or enforce; interpret broad statutory terms; act repeatedly or across a broad class of cases; exercise authority without detailed statutory formulas or fixed criteria; or shape implementation in ways that materially affect regulated parties or beneficiaries.
"""


CONSTRAINT_SIGNALS_TEXT = """## Constraint signals

Identify statutory features that limit agency discretion. Consider whether the law specifies fixed formulas, deadlines, amounts, thresholds, or triggers; limits authority to a narrow product, institution, transaction, program, or factual condition; requires agency action but leaves little choice over substance; provides detailed statutory criteria that determine or strongly structure the outcome; requires reports, consultation, findings, hearings, review, or procedural steps; includes sunset provisions, temporary authority, or narrow emergency conditions; assigns authority mainly to implement, administer, publish, transmit, conform, or report; or requires approval by another institutional actor before action becomes effective.
"""


BOUNDARY_RULES_TEXT = """## Boundary rules

1-vs-2 boundary: Use Rank 1 rather than Rank 2 when the agency role is mainly ministerial, administrative, reporting, publishing, recordkeeping, or mechanical implementation. Use Rank 2 rather than Rank 1 when the agency makes real determinations, approvals, adjustments, waivers, enforcement choices, or implementation choices that affect legal or practical outcomes.

2-vs-3 boundary: Use Rank 2 rather than Rank 3 when Congress specifies the core policy choice; the agency applies statutory criteria rather than defining them; the authority is limited to a narrow class of entities, products, transactions, or facts; the statute requires findings, reports, consultation, hearings, or procedures that materially structure the decision; or the law authorizes implementation rather than broad policy design. Use Rank 3 rather than Rank 2 only when the agency can define, adjust, or choose substantive policy content within the statutory scheme.

3-vs-4 boundary: Use Rank 3 rather than Rank 4 when the agency has broad authority but must operate within a defined statutory program; the statute provides policy goals, criteria, procedures, or scope limits; the agency discretion is important but not open-ended; or the authority applies to a defined sector, program, or regulatory problem. Use Rank 4 only when the agency receives open-ended, policy-shaping authority with few meaningful statutory constraints.
"""


ANTI_INFLATION_TEXT = """## Anti-inflation rule

Do not assign Rank 3 or Rank 4 merely because the statute uses broad words such as regulate, prescribe, determine, approve, exempt, waive, modify, issue rules, as necessary, or in the public interest. These words indicate possible discretion, but they do not by themselves establish substantial or high discretion. A Rank 3 or Rank 4 requires evidence that the agency can make broad substantive policy choices, not merely administer a statutory scheme. When the evidence is mixed, prefer the lower rank unless the statute clearly gives the agency open-ended or substantial policy-making authority.
"""


RECALIBRATION_TEXT = """## Recalibration rule

After assigning the provisional rank, assess whether the case lies near the boundary between two adjacent ranks.

Use the strength of the affirmative discretion signals and the strength of the constraint signals to determine whether the provisional rank should be adjusted.

If the evidence places the case in the lower 25 percent of the provisional rank, lower the prediction by one rank.

If the evidence places the case in the upper 25 percent of the provisional rank, raise the prediction by one rank.

If the evidence falls in the middle 50 percent of the provisional rank, retain the provisional rank as predicted.

Do not recalibrate by more than one rank. Do not recalibrate Rank 0 downward. Do not recalibrate Rank 4 upward. Do not recalibrate Rank 0 upward unless there is clear evidence of delegated authority.

When moving upward from Rank 2 to Rank 3, or from Rank 3 to Rank 4, require clear evidence that the agency has broad substantive policy choice, not merely implementation authority, procedural authority, or bounded administrative judgment.

When moving downward from Rank 3 to Rank 2, give weight to statutory criteria, formulas, narrow scope, procedural requirements, reporting duties, consultation requirements, sunsets, fixed triggers, and defined statutory objectives.
"""


CASCADE_STAGE_2_TEXT = """Stage 2: Minimal discretion screen.
Question: After identifying constraints, is the remaining discretion below 2?
Answer yes if the delegated role is narrow, mechanical, procedural, ministerial, administrative, or tightly constrained. This includes reporting, transmitting information, applying a clear formula, carrying out a fixed duty, or administering details where Congress already specified the substantive rule.
If yes, assign Provisional_Rank: 1 and continue to boundary/recalibration review.
If no, continue.
Burden rule: default to rank 1 unless the text clearly shows real agency judgment beyond narrow implementation.
"""


CASCADE_STAGE_3_TEXT = """Stage 3: Limited versus substantial discretion screen.
Question: After identifying constraints, is the remaining discretion below 3?
Answer yes if the law delegates real implementation, supervisory, regulatory, enforcement, or administrative authority, but that authority is bounded by significant statutory rules, standards, deadlines, reporting duties, consultation requirements, exemptions, appeals, oversight, approval requirements, or limits on waiver, enforcement, supervision, interpretation, or regulatory scope.
If yes, assign Provisional_Rank: 2 and continue to boundary/recalibration review.
If no, continue.
Burden rule: default to rank 2 unless the text clearly shows substantial agency choice over policy standards, enforcement priorities, supervisory methods, exemptions, waivers, interpretations, approvals, or regulatory scope. Do not move above rank 2 merely because the law gives rulemaking, enforcement, supervisory, or implementation authority.
"""


CASCADE_STAGE_4_TEXT = """Stage 4: Substantial versus high discretion screen.
Question: After identifying constraints, is the remaining discretion below 4?
Answer yes if the law delegates meaningful authority to interpret, implement, enforce, supervise, regulate, approve, waive, exempt, or set standards, but the authority is not broad, central, and weakly constrained enough to qualify as high discretion.
If yes, assign Provisional_Rank: 3 and continue to boundary/recalibration review.
If no, assign Provisional_Rank: 4 and continue to boundary/recalibration review.
Burden rule: default to rank 3 unless the text clearly shows broad, central, weakly constrained policymaking discretion. Do not assign rank 4 simply because the law delegates broad authority. Rank 4 requires broad or central delegation plus limited or weak constraints.
"""


M9_RANK_DISCIPLINE = """## Rank Discipline
Rank 0: No delegated discretion. The law does not give an agency meaningful authority to decide legal obligations, benefits, standards, approvals, enforcement, or implementation choices.
Rank 1: Minimal discretion. The agency performs a narrow, ministerial, procedural, reporting, administrative, or implementation role. Any judgment is highly bounded by statutory text.
Rank 2: Bounded discretion. The agency has real authority, but the statute gives meaningful limits through criteria, formulas, narrow scope, procedural requirements, fixed triggers, defined objectives, or oversight. This is the default rank when agency authority exists but is substantially constrained.
Rank 3: Substantial discretion. The agency can make meaningful policy choices, define standards, grant exemptions, set conditions, or shape implementation across a significant domain. Statutory constraints exist but do not determine the outcome.
Rank 4: High discretion. The agency receives broad, durable, policy-shaping authority with few meaningful statutory constraints. Use this rank only when the statute leaves major substantive choices to the agency.

Use the following discretion rank definitions:
## Discretion Ranks
"1": Minimal discretion. If the delegated role is narrow, mechanical, procedural, ministerial, administrative, or tightly constrained. This includes reporting, transmitting information, applying a clear formula, carrying out a fixed duty, or administering details where Congress already specified the substantive rule. Default to rank 1 unless the text clearly shows real agency judgment beyond narrow implementation.

"2": Limited versus substantial discretion. If the law delegates real implementation, supervisory, regulatory, enforcement, or administrative authority, but that authority is bounded by significant statutory rules, standards, deadlines, reporting duties, consultation requirements, exemptions, appeals, oversight, approval requirements, or limits on waiver, enforcement, supervision, interpretation, or regulatory scope. Default to rank 2 unless the text clearly shows substantial agency choice over policy standards, enforcement priorities, supervisory methods, exemptions, waivers, interpretations, approvals, or regulatory scope. Do not move above rank 2 merely because the law gives rulemaking, enforcement, supervisory, or implementation authority.

"3": Substantial versus high discretion. If the law delegates meaningful authority to interpret, implement, enforce, supervise, regulate, approve, waive, exempt, or set standards, but the authority is not broad, central, and weakly constrained enough to qualify as high discretion. Default to rank 3 unless the text clearly shows broad, central, weakly constrained policymaking discretion. Do not assign rank 4 simply because the law delegates broad authority. Rank 4 requires broad or central delegation plus limited or weak constraints.

"4": High discretion. The agency receives broad, durable, policy-shaping authority with few meaningful statutory constraints. Use this rank only when the statute leaves major substantive choices to the agency.
"""


B3_STAGE_2_TEXT = """Binary classifiers:
0 or 1:
Stage 2: 0=(1,2) vs. 1=(3,4):
## Rank Discipline
Rank 0: Minimal or bounded discretion. The agency performs a narrow, ministerial, procedural, reporting, administrative, or implementation role. Any judgment is highly bounded by statutory text. Or, the agency has real authority, but the statute gives meaningful limits through criteria, formulas, narrow scope, procedural requirements, fixed triggers, defined objectives, or oversight. This is the default rank when agency authority exists but is substantially constrained.

Rank 1: Substantial or high discretion. The agency can make meaningful policy choices, define standards, grant exemptions, set conditions, or shape implementation across a significant domain. Statutory constraints exist but do not determine the outcome. Or, the agency receives broad, durable, policy-shaping authority with few meaningful statutory constraints. Use this rank only when the statute leaves major substantive choices to the agency.

Use the following discretion rank definitions:
## Discretion Ranks
"0": Minimal or limited discretion. If the delegated role is narrow, mechanical, procedural, ministerial, administrative, or tightly constrained. This includes reporting, transmitting information, applying a clear formula, carrying out a fixed duty, or administering details where Congress already specified the substantive rule. Default to rank 1 unless the text clearly shows real agency judgment beyond narrow implementation. Or, if the law delegates real implementation, supervisory, regulatory, enforcement, or administrative authority, but that authority is bounded by significant statutory rules, standards, deadlines, reporting duties, consultation requirements, exemptions, appeals, oversight, approval requirements, or limits on waiver, enforcement, supervision, interpretation, or regulatory scope. Default to rank 0 unless the text clearly shows substantial agency choice over policy standards, enforcement priorities, supervisory methods, exemptions, waivers, interpretations, approvals, or regulatory scope. Do not move above rank 2 merely because the law gives rulemaking, enforcement, supervisory, or implementation authority.

"1": Substantial or high discretion. If the law delegates meaningful authority to interpret, implement, enforce, supervise, regulate, approve, waive, exempt, or set standards, but the authority is not broad, central, and weakly constrained enough to qualify as high discretion. Default to rank 3 unless the text clearly shows broad, central, weakly constrained policymaking discretion. Do not assign rank 4 simply because the law delegates broad authority. Rank 4 requires broad or central delegation plus limited or weak constraints. Or, a broad delegated authority. Constraints may be present but do not significantly limit action.
"""


B3_STAGE_3A_TEXT = """Stage 3a: 0=1 vs. 1=2:
## Rank Discipline
Rank 0: Minimal discretion. The agency performs a narrow, ministerial, procedural, reporting, administrative, or implementation role. Any judgment is highly bounded by statutory text.
Rank 1: Bounded discretion. The agency has real authority, but the statute gives meaningful limits through criteria, formulas, narrow scope, procedural requirements, fixed triggers, defined objectives, or oversight. This is the default rank when agency authority exists but is substantially constrained.

Use the following discretion rank definitions:
## Discretion Ranks
"0": Minimal discretion. If the delegated role is narrow, mechanical, procedural, ministerial, administrative, or tightly constrained. This includes reporting, transmitting information, applying a clear formula, carrying out a fixed duty, or administering details where Congress already specified the substantive rule. Default to rank 1 unless the text clearly shows real agency judgment beyond narrow implementation.

"1": Limited versus substantial discretion. If the law delegates real implementation, supervisory, regulatory, enforcement, or administrative authority, but that authority is bounded by significant statutory rules, standards, deadlines, reporting duties, consultation requirements, exemptions, appeals, oversight, approval requirements, or limits on waiver, enforcement, supervision, interpretation, or regulatory scope. Default to rank 2 unless the text clearly shows substantial agency choice over policy standards, enforcement priorities, supervisory methods, exemptions, waivers, interpretations, approvals, or regulatory scope. Do not move above rank 2 merely because the law gives rulemaking, enforcement, supervisory, or implementation authority.
"""


B3_STAGE_3B_TEXT = """Stage 3b: 0=3 vs. 1=4
## Rank Discipline
Rank 0: Substantial discretion. The agency can make meaningful policy choices, define standards, grant exemptions, set conditions, or shape implementation across a significant domain. Statutory constraints exist but do not determine the outcome.
Rank 1: High discretion. The agency receives broad, durable, policy-shaping authority with few meaningful statutory constraints. Use this rank only when the statute leaves major substantive choices to the agency.

Use the following discretion rank definitions:
## Discretion Ranks
"0": Substantial versus high discretion. If the law delegates meaningful authority to interpret, implement, enforce, supervise, regulate, approve, waive, exempt, or set standards, but the authority is not broad, central, and weakly constrained enough to qualify as high discretion. Default to rank 3 unless the text clearly shows broad, central, weakly constrained policymaking discretion. Do not assign rank 4 simply because the law delegates broad authority. Rank 4 requires broad or central delegation plus limited or weak constraints.

"1": High discretion. A broad delegated authority. Constraints may be present but do not significantly limit action.
"""


ACTOR_IDENTIFICATION_PROMPT = f"""Stage: Actor Identification

Purpose: Split the professor's inventory-first method into a dedicated node that identifies which federal administrative actor receives authority.

{DISCRETION_SHARED_CONTEXT}

Task for this node only:
- Identify every U.S. federal agency, independent commission, executive branch actor, the President, or another administrative actor that the supplied text actually authorizes or directs to act.
- Do not list actors that are merely mentioned.
- Do not infer actors from background law.
- If the evidence is mixed, prefer the narrower set of actors.

## Output Format

Return only the following fields:
- administrative_actor: list[string]
- actor_identification_rationale: string
- actor_evidence: list[string]
"""


DELEGATED_AUTHORITY_PROMPT = f"""Stage: Delegated Authority Extraction

Purpose: Extract the actual authority or responsibility granted to the identified actor before later nodes score discretion.

{DISCRETION_SHARED_CONTEXT}

Task for this node only:
- Identify the specific delegated authority or responsibility to act.
- Capture authorities such as implement, administer, enforce, supervise, regulate, interpret, approve, deny, waive, exempt, investigate, issue rules, set standards, make determinations, or carry out statutory responsibilities only when the supplied text supports them.
- Do not turn a mere reference to an agency into authority.
- Do not import unsupplied background law.

## Output Format

Return only the following fields:
- delegated_authority: list[string]
- delegated_authority_rationale: string
- delegated_authority_evidence: list[string]
"""


AFFIRMATIVE_SIGNAL_PROMPT = f"""Stage: Affirmative Discretion Signals

Purpose: Isolate only the statutory features that increase agency discretion.

{DISCRETION_SHARED_CONTEXT}

{AFFIRMATIVE_SIGNALS_TEXT}

Task for this node only:
- Return the affirmative discretion signals that are actually present in the supplied text.
- Do not infer substantial discretion from broad verbs alone.
- Prefer a shorter, more defensible list when the evidence is mixed.

## Output Format

Return only the following fields:
- affirmative_discretion_signals: list[string]
- affirmative_signal_rationale: string
- affirmative_signal_evidence: list[string]
"""


CONSTRAINT_SIGNAL_PROMPT = f"""Stage: Constraint Signals

Purpose: Isolate the statutory features that limit, channel, or structure agency discretion.

{DISCRETION_SHARED_CONTEXT}

{CONSTRAINT_SIGNALS_TEXT}

Task for this node only:
- Return the constraint signals that are actually present in the supplied text.
- Treat exemptions, narrow scope, fixed triggers, criteria, findings, deadlines, consultation, approval requirements, or review mechanisms as constraints when the text supports that reading.
- Prefer the lower-discretion reading when the same provision could plausibly be read as either empowering or constraining.

## Output Format

Return only the following fields:
- constraint_evidence: list[string]
- constraint_signal_rationale: string
- constraint_signal_evidence: list[string]
"""


SCOPE_AND_CENTRALITY_PROMPT = f"""Stage: Scope and Centrality Assessment

Purpose: Judge whether the delegated authority is narrow or broad, how central it is to the law, and how strong the constraints appear before rank assignment.

{DISCRETION_SHARED_CONTEXT}

{ANTI_INFLATION_TEXT}

Task for this node only:
- Classify scope_breadth as one of none, narrow, moderate, broad.
- Classify implementation_centrality as one of none, supporting, central.
- Classify constraint_strength as one of none, weak, moderate, strong.
- Base these judgments only on the supplied text and the upstream extracted authority and constraints.
- Do not classify authority as broad or central merely because the text uses expansive verbs.

## Output Format

Return only the following fields:
- scope_breadth: enum(none, narrow, moderate, broad)
- implementation_centrality: enum(none, supporting, central)
- constraint_strength: enum(none, weak, moderate, strong)
- scope_and_centrality_rationale: string
"""


RESIDUAL_LEEWAY_PROMPT = f"""Stage: Residual Leeway Assessment

Purpose: Assess the remaining agency leeway after taking the identified constraints seriously.

{DISCRETION_SHARED_CONTEXT}

Task for this node only:
- Assess the residual agency leeway after constraints as one of None, Low, Bounded, Substantial, or High.
- Explain why the identified authority remains tightly constrained or why meaningful policy choice remains.
- When evidence is ambiguous, choose the lower residual-leeway category unless the supplied text clearly supports the higher one.

## Output Format

Return only the following fields:
- residual_leeway: enum(None, Low, Bounded, Substantial, High)
- residual_leeway_rationale: string
"""


INVENTORY_SYNTHESIS_PROMPT = f"""Stage: Inventory Synthesis

Purpose: Synthesize the inventory-first record that later rank branches will use instead of restarting the analysis from scratch.

{DISCRETION_SHARED_CONTEXT}

{AFFIRMATIVE_SIGNALS_TEXT}

{CONSTRAINT_SIGNALS_TEXT}

{ANTI_INFLATION_TEXT}

Task for this node only:
- Synthesize the upstream actor, authority, affirmative signals, constraints, scope, centrality, and residual leeway into a concise inventory rationale.
- Explain the strongest reasons the case should stay lower or move higher.
- Do not assign the final rank in this node.

## Output Format

Return only the following fields:
- inventory_rationale: string
- inventory_evidence: list[string]
- inventory_boundary_focus: string
"""


CASCADE_STAGE_2_PROMPT = f"""Stage: Cascade Stage 2 Minimal Screen

Purpose: Recreate the professor's Stage 2 minimal-discretion screen as a dedicated node.

{DISCRETION_SHARED_CONTEXT}

## Cascade

{CASCADE_STAGE_2_TEXT}

{ANTI_INFLATION_TEXT}

## Output Format

Return only the following fields:
- cascade_stage2_below_2: boolean
- cascade_stage2_rationale: string
- cascade_stage2_evidence: list[string]
"""


CASCADE_STAGE_3_PROMPT = f"""Stage: Cascade Stage 3 Bounded Screen

Purpose: Recreate the professor's Stage 3 limited-versus-substantial screen as a dedicated node.

{DISCRETION_SHARED_CONTEXT}

## Cascade

{CASCADE_STAGE_3_TEXT}

{ANTI_INFLATION_TEXT}

## Output Format

Return only the following fields:
- cascade_stage3_below_3: boolean
- cascade_stage3_rationale: string
- cascade_stage3_evidence: list[string]
"""


CASCADE_STAGE_4_PROMPT = f"""Stage: Cascade Stage 4 Substantial Screen

Purpose: Recreate the professor's Stage 4 substantial-versus-high screen as a dedicated node.

{DISCRETION_SHARED_CONTEXT}

## Cascade

{CASCADE_STAGE_4_TEXT}

{ANTI_INFLATION_TEXT}

## Output Format

Return only the following fields:
- cascade_stage4_below_4: boolean
- cascade_stage4_rationale: string
- cascade_stage4_evidence: list[string]
"""


CASCADE_NORMALIZER_PROMPT = f"""Stage: Cascade Provisional Rank Normalizer

Purpose: Convert the selected cascade branch into a clean provisional-rank record before boundary review.

{DISCRETION_SHARED_CONTEXT}

Task for this node only:
- Explain why the cascade path stopped at the selected stage.
- Restate why the provisional rank is 1, 2, 3, or 4 using the stage-specific rationale and the upstream inventory.
- Do not apply recalibration in this node.

## Output Format

Return only the following fields:
- cascade_provisional_rank_normalization: string
"""


CASCADE_BOUNDARY_PROMPT = f"""Stage: Cascade Boundary Review

Purpose: Apply the professor's boundary rules to the already-assigned cascade provisional rank.

{DISCRETION_SHARED_CONTEXT}

{BOUNDARY_RULES_TEXT}

{ANTI_INFLATION_TEXT}

Task for this node only:
- Explain the most important boundary call for the provisional rank.
- Classify the case as lower_25, middle_50, or upper_25 within the provisional rank.

## Output Format

Return only the following fields:
- cascade_boundary_decision: string
- cascade_boundary_bucket: enum(lower_25, middle_50, upper_25)
"""


CASCADE_RECALIBRATION_PROMPT = f"""Stage: Cascade Recalibration Final

Purpose: Apply the professor's recalibration rule to produce the final cascade rank.

{DISCRETION_SHARED_CONTEXT}

{RECALIBRATION_TEXT}

Task for this node only:
- Use the provisional rank and boundary placement to decide whether to keep, raise, or lower the prediction.
- Do not move more than one rank.
- Return the change as -1, 0, or 1.

## Output Format

Return only the following fields:
- cascade_recalibration: string
- cascade_recalibration_delta: integer
- cascade_discretion_rank: integer
- cascade_decision_rationale: string
"""


M9_PREP_PROMPT = f"""Stage: M9 Rank Discipline Prep

Purpose: Prepare the multiclass branch by organizing the relevant rank-discipline evidence before the actual provisional rank decision.

{DISCRETION_SHARED_CONTEXT}

{M9_RANK_DISCIPLINE}

{ANTI_INFLATION_TEXT}

Task for this node only:
- Explain which rank boundaries are most plausibly in play.
- State which facts pull the case downward and which, if any, pull it upward.
- Do not finalize the rank in this node.

## Output Format

Return only the following fields:
- m9_rank_prep: string
- m9_rank_evidence: list[string]
"""


M9_MULTICLASS_PROMPT = f"""Stage: M9 Multiclass Rank

Purpose: Run the professor's streamlined multiclass path using the inventory and rank-discipline preparation rather than recomputing from scratch.

{DISCRETION_SHARED_CONTEXT}

{M9_RANK_DISCIPLINE}

{ANTI_INFLATION_TEXT}

Task for this node only:
- Assign a provisional multiclass discretion rank from 1 to 4.
- Prefer the lower rank when the evidence is mixed.

## Output Format

Return only the following fields:
- m9_provisional_rank: integer
- m9_provisional_rationale: string
"""


M9_BOUNDARY_PROMPT = f"""Stage: M9 Boundary Review

Purpose: Use the professor's boundary rules to position the multiclass provisional rank near the lower edge, middle, or upper edge.

{DISCRETION_SHARED_CONTEXT}

{BOUNDARY_RULES_TEXT}

{ANTI_INFLATION_TEXT}

## Output Format

Return only the following fields:
- m9_boundary_decision: string
- m9_boundary_bucket: enum(lower_25, middle_50, upper_25)
"""


M9_RECALIBRATION_PROMPT = f"""Stage: M9 Recalibration Final

Purpose: Apply the optional calibration logic to the multiclass path so the detailed workflow can compare calibrated and uncalibrated reasoning.

{DISCRETION_SHARED_CONTEXT}

{RECALIBRATION_TEXT}

## Output Format

Return only the following fields:
- m9_recalibration: string
- m9_recalibration_delta: integer
- m9_discretion_rank: integer
- m9_decision_rationale: string
"""


B3_BAND_PROMPT = f"""Stage: B3 Coarse Band Screen

Purpose: Run the professor's binary decomposition path by first deciding whether the law belongs in the lower-discretion band or the higher-discretion band.

{DISCRETION_SHARED_CONTEXT}

{B3_STAGE_2_TEXT}

{ANTI_INFLATION_TEXT}

Task for this node only:
- Classify the case into bounded or agency.
- bounded means minimal or bounded discretion, corresponding to ranks 1 or 2.
- agency means substantial or high discretion, corresponding to ranks 3 or 4.

## Output Format

Return only the following fields:
- b3_discretion_band: enum(bounded, agency)
- b3_band_rationale: string
- b3_band_evidence: list[string]
"""


B3_LOW_SPLIT_PROMPT = f"""Stage: B3 Low Band Split

Purpose: If the binary path falls into the lower band, decide between rank 1 and rank 2.

{DISCRETION_SHARED_CONTEXT}

{B3_STAGE_3A_TEXT}

{ANTI_INFLATION_TEXT}

## Output Format

Return only the following fields:
- b3_provisional_rank: integer
- b3_branch_rationale: string
- b3_branch_evidence: list[string]
"""


B3_HIGH_SPLIT_PROMPT = f"""Stage: B3 High Band Split

Purpose: If the binary path falls into the higher band, decide between rank 3 and rank 4.

{DISCRETION_SHARED_CONTEXT}

{B3_STAGE_3B_TEXT}

{ANTI_INFLATION_TEXT}

## Output Format

Return only the following fields:
- b3_provisional_rank: integer
- b3_branch_rationale: string
- b3_branch_evidence: list[string]
"""


B3_NORMALIZER_PROMPT = f"""Stage: B3 Provisional Rank Normalizer

Purpose: Normalize the selected binary branch into a single provisional-rank explanation before boundary review.

{DISCRETION_SHARED_CONTEXT}

Task for this node only:
- Restate why the chosen band and adjacent-rank split imply the current provisional rank.
- Do not recalibrate in this node.

## Output Format

Return only the following fields:
- b3_normalized_provisional_rank: integer
- b3_provisional_rank_normalization: string
"""


B3_BOUNDARY_PROMPT = f"""Stage: B3 Boundary Review

Purpose: Apply the professor's boundary rules to the binary path before recalibration.

{DISCRETION_SHARED_CONTEXT}

{BOUNDARY_RULES_TEXT}

{ANTI_INFLATION_TEXT}

## Output Format

Return only the following fields:
- b3_boundary_decision: string
- b3_boundary_bucket: enum(lower_25, middle_50, upper_25)
"""


B3_RECALIBRATION_PROMPT = f"""Stage: B3 Recalibration Final

Purpose: Finish the binary path by applying the professor's recalibration rule to the provisional adjacent-rank decision.

{DISCRETION_SHARED_CONTEXT}

{RECALIBRATION_TEXT}

## Output Format

Return only the following fields:
- b3_recalibration: string
- b3_recalibration_delta: integer
- b3_discretion_rank: integer
- b3_decision_rationale: string
"""


def professor_discretion_prompt_suite_detailed_definition() -> dict[str, Any]:
    nodes = [
        {
            "id": "document_input",
            "kind": "document_input",
            "name": "Law file input",
            "description": "Full law text or a law-level summary passed from the campaign into the detailed professor workflow.",
            "position": {"x": 40, "y": 860},
            "config": {"source_policy": "full_text"},
        },
        _llm_node(
            "prompt_v8_delegation_gate",
            "Prompt v8 Delegation Gate",
            "Detailed Prompt_v8 delegation gate preserved as the first benchmark-aligned screen.",
            340,
            860,
            PROMPT_V8_DELEGATION_GATE,
            [
                {"key": "delegate_law", "label": "Delegate Law", "type": "boolean", "required": True},
                {"key": "delegation_rationale", "label": "Delegation rationale", "type": "string", "required": True},
                {"key": "delegation_evidence", "label": "Delegation evidence", "type": "evidence[]", "required": False},
            ],
            prompt_provenance=_prov(
                "Updates/Prompts/Prompt_v8.txt",
                [
                    "Coding Task",
                    "Core Definition",
                    "Benchmark Alignment Rules",
                    "Financial Regulation Scope Rule",
                    "Positive Signals for DelegateLaw = Y",
                    "Negative Signals for DelegateLaw = N",
                ],
                "verbatim_plus_output_schema",
            ),
        ),
        _condition_node(
            "delegation_found",
            "Delegation found?",
            "Branch to no-delegation defaults when the Prompt_v8 gate is false; otherwise run the detailed discretion workflow.",
            650,
            860,
            "prompt_v8_delegation_gate.delegate_law",
            False,
            "No delegation",
            "Delegation found",
        ),
        _set_node(
            "no_delegation_defaults",
            "Set no-delegation defaults",
            "Populate every shared and branch output with a deterministic no-delegation value so the workflow can still emit a complete dashboard row.",
            980,
            220,
            [
                {"field": "administrative_actor", "type": "list[string]", "value": []},
                {"field": "actor_identification_rationale", "type": "string", "value": "No actor was coded because the delegation gate was false."},
                {"field": "actor_evidence", "type": "evidence[]", "value": []},
                {"field": "delegated_authority", "type": "list[string]", "value": []},
                {"field": "delegated_authority_rationale", "type": "string", "value": "No delegated authority was extracted because the delegation gate was false."},
                {"field": "delegated_authority_evidence", "type": "evidence[]", "value": []},
                {"field": "affirmative_discretion_signals", "type": "list[string]", "value": []},
                {"field": "affirmative_signal_rationale", "type": "string", "value": "No affirmative discretion signals were coded because the delegation gate was false."},
                {"field": "affirmative_signal_evidence", "type": "evidence[]", "value": []},
                {"field": "constraint_evidence", "type": "list[string]", "value": []},
                {"field": "constraint_signal_rationale", "type": "string", "value": "Constraint coding is not applicable because no delegated authority was identified."},
                {"field": "constraint_signal_evidence", "type": "evidence[]", "value": []},
                {"field": "scope_breadth", "type": "string", "value": "none"},
                {"field": "implementation_centrality", "type": "string", "value": "none"},
                {"field": "constraint_strength", "type": "string", "value": "none"},
                {"field": "scope_and_centrality_rationale", "type": "string", "value": "Scope and centrality are not applicable because the delegation gate was false."},
                {"field": "residual_leeway", "type": "string", "value": "None"},
                {"field": "residual_leeway_rationale", "type": "string", "value": "Residual leeway is none because no delegated authority was identified."},
                {"field": "inventory_rationale", "type": "string", "value": "The workflow stopped after Prompt_v8 because no meaningful delegated authority was identified."},
                {"field": "inventory_evidence", "type": "evidence[]", "value": []},
                {"field": "inventory_boundary_focus", "type": "string", "value": "No downstream discretion boundary was reached because the delegation gate was false."},
                {"field": "cascade_stage_reached", "type": "integer", "value": 1},
                {"field": "cascade_provisional_rank", "type": "integer", "value": 0},
                {"field": "cascade_provisional_rank_normalization", "type": "string", "value": "Cascade stopped at the delegation screen because no delegated authority was identified."},
                {"field": "cascade_boundary_decision", "type": "string", "value": "No cascade boundary review was needed because the delegation gate was false."},
                {"field": "cascade_boundary_bucket", "type": "string", "value": "middle_50"},
                {"field": "cascade_recalibration", "type": "string", "value": "Not applicable because no delegation was identified."},
                {"field": "cascade_recalibration_delta", "type": "integer", "value": 0},
                {"field": "cascade_discretion_rank", "type": "integer", "value": 0},
                {"field": "cascade_decision_rationale", "type": "string", "value": "No delegated authority was identified, so the cascade path assigns discretion rank 0."},
                {"field": "m9_rank_prep", "type": "string", "value": "The multiclass path did not prepare rank discipline because the delegation gate was false."},
                {"field": "m9_rank_evidence", "type": "evidence[]", "value": []},
                {"field": "m9_provisional_rank", "type": "integer", "value": 0},
                {"field": "m9_provisional_rationale", "type": "string", "value": "The multiclass path assigns provisional rank 0 because the delegation gate was false."},
                {"field": "m9_boundary_decision", "type": "string", "value": "No M9 boundary review was needed because the delegation gate was false."},
                {"field": "m9_boundary_bucket", "type": "string", "value": "middle_50"},
                {"field": "m9_recalibration", "type": "string", "value": "Not applicable because no delegation was identified."},
                {"field": "m9_recalibration_delta", "type": "integer", "value": 0},
                {"field": "m9_discretion_rank", "type": "integer", "value": 0},
                {"field": "m9_decision_rationale", "type": "string", "value": "No delegated authority was identified, so the M9 path assigns discretion rank 0."},
                {"field": "b3_discretion_band", "type": "string", "value": "no_delegation"},
                {"field": "b3_band_rationale", "type": "string", "value": "The binary path stopped because the delegation gate was false."},
                {"field": "b3_band_evidence", "type": "evidence[]", "value": []},
                {"field": "b3_provisional_rank", "type": "integer", "value": 0},
                {"field": "b3_branch_rationale", "type": "string", "value": "No adjacent-rank split was run because the delegation gate was false."},
                {"field": "b3_branch_evidence", "type": "evidence[]", "value": []},
                {"field": "b3_provisional_rank_normalization", "type": "string", "value": "The binary workflow stopped before band splitting because no delegated authority was identified."},
                {"field": "b3_boundary_decision", "type": "string", "value": "No B3 boundary review was needed because the delegation gate was false."},
                {"field": "b3_boundary_bucket", "type": "string", "value": "middle_50"},
                {"field": "b3_recalibration", "type": "string", "value": "Not applicable because no delegation was identified."},
                {"field": "b3_recalibration_delta", "type": "integer", "value": 0},
                {"field": "b3_discretion_rank", "type": "integer", "value": 0},
                {"field": "b3_decision_rationale", "type": "string", "value": "No delegated authority was identified, so the B3 path assigns discretion rank 0."},
            ],
        ),
        _llm_node(
            "actor_identification",
            "Actor Identification",
            "Identify the actual federal administrative actor before extracting authority, signals, or constraints.",
            980,
            860,
            ACTOR_IDENTIFICATION_PROMPT,
            [
                {"key": "administrative_actor", "label": "Administrative actor", "type": "list[string]", "required": False},
                {"key": "actor_identification_rationale", "label": "Actor identification rationale", "type": "string", "required": True},
                {"key": "actor_evidence", "label": "Actor evidence", "type": "evidence[]", "required": False},
            ],
            ["prompt_v8_delegation_gate.delegate_law", "prompt_v8_delegation_gate.delegation_rationale", "prompt_v8_delegation_gate.delegation_evidence"],
            prompt_provenance=_prov(
                "Updates/new prompts/AI_EPR_Discretion_Cascade_Prompt8_v2.md",
                ["Use this sequence", "Definitions"],
                "workflow_split_from_source",
            ),
        ),
        _llm_node(
            "delegated_authority_extraction",
            "Delegated Authority Extraction",
            "Extract the authority actually granted to the identified actor before any rank branch starts.",
            1290,
            860,
            DELEGATED_AUTHORITY_PROMPT,
            [
                {"key": "delegated_authority", "label": "Delegated authority", "type": "list[string]", "required": False},
                {"key": "delegated_authority_rationale", "label": "Delegated authority rationale", "type": "string", "required": True},
                {"key": "delegated_authority_evidence", "label": "Delegated authority evidence", "type": "evidence[]", "required": False},
            ],
            [
                "prompt_v8_delegation_gate.delegate_law",
                "actor_identification.administrative_actor",
                "actor_identification.actor_identification_rationale",
                "actor_identification.actor_evidence",
            ],
            prompt_provenance=_prov(
                "Updates/new prompts/AI_EPR_Discretion_Cascade_Prompt8_v2.md",
                ["Use this sequence", "Definitions"],
                "workflow_split_from_source",
            ),
        ),
        _llm_node(
            "affirmative_discretion_signals",
            "Affirmative Discretion Signals",
            "Separate upward discretion signals into their own node instead of mixing them with authority and constraints.",
            1600,
            640,
            AFFIRMATIVE_SIGNAL_PROMPT,
            [
                {"key": "affirmative_discretion_signals", "label": "Affirmative discretion signals", "type": "list[string]", "required": False},
                {"key": "affirmative_signal_rationale", "label": "Affirmative signal rationale", "type": "string", "required": True},
                {"key": "affirmative_signal_evidence", "label": "Affirmative signal evidence", "type": "evidence[]", "required": False},
            ],
            [
                "actor_identification.administrative_actor",
                "delegated_authority_extraction.delegated_authority",
                "delegated_authority_extraction.delegated_authority_rationale",
                "delegated_authority_extraction.delegated_authority_evidence",
            ],
            prompt_provenance=_prov(
                "Updates/new prompts/AI_EPR_Discretion_Cascade_Prompt8_v2.md",
                ["Calibration Module", "Affirmative discretion signals"],
                "workflow_split_from_source",
            ),
        ),
        _llm_node(
            "constraint_signals",
            "Constraint Signals",
            "Separate constraint coding so later rank nodes can compare signals against constraints explicitly.",
            1600,
            1080,
            CONSTRAINT_SIGNAL_PROMPT,
            [
                {"key": "constraint_evidence", "label": "Constraint evidence", "type": "list[string]", "required": False},
                {"key": "constraint_signal_rationale", "label": "Constraint signal rationale", "type": "string", "required": True},
                {"key": "constraint_signal_evidence", "label": "Constraint signal evidence", "type": "evidence[]", "required": False},
            ],
            [
                "actor_identification.administrative_actor",
                "delegated_authority_extraction.delegated_authority",
                "delegated_authority_extraction.delegated_authority_rationale",
                "delegated_authority_extraction.delegated_authority_evidence",
            ],
            prompt_provenance=_prov(
                "Updates/new prompts/AI_EPR_Discretion_Cascade_Prompt8_v2.md",
                ["Calibration Module", "Constraint signals"],
                "workflow_split_from_source",
            ),
        ),
        _llm_node(
            "scope_and_centrality_assessment",
            "Scope and Centrality Assessment",
            "Judge breadth, centrality, and constraint strength explicitly before residual leeway is assessed.",
            1910,
            860,
            SCOPE_AND_CENTRALITY_PROMPT,
            [
                {"key": "scope_breadth", "label": "Scope breadth", "type": "enum", "options": ["none", "narrow", "moderate", "broad"], "required": True},
                {"key": "implementation_centrality", "label": "Implementation centrality", "type": "enum", "options": ["none", "supporting", "central"], "required": True},
                {"key": "constraint_strength", "label": "Constraint strength", "type": "enum", "options": ["none", "weak", "moderate", "strong"], "required": True},
                {"key": "scope_and_centrality_rationale", "label": "Scope and centrality rationale", "type": "string", "required": True},
            ],
            [
                "delegated_authority_extraction.delegated_authority",
                "delegated_authority_extraction.delegated_authority_rationale",
                "affirmative_discretion_signals.affirmative_discretion_signals",
                "constraint_signals.constraint_evidence",
                "constraint_signals.constraint_signal_rationale",
            ],
            prompt_provenance=_prov(
                "Updates/new prompts/AI_EPR_Discretion_Cascade_Prompt8_v2.md",
                ["Rank Discipline", "Anti-inflation rule"],
                "workflow_split_from_source",
            ),
        ),
        _llm_node(
            "residual_leeway_assessment",
            "Residual Leeway Assessment",
            "Assess the remaining discretion after constraints are taken seriously.",
            2220,
            860,
            RESIDUAL_LEEWAY_PROMPT,
            [
                {"key": "residual_leeway", "label": "Residual leeway", "type": "enum", "options": ["None", "Low", "Bounded", "Substantial", "High"], "required": True},
                {"key": "residual_leeway_rationale", "label": "Residual leeway rationale", "type": "string", "required": True},
            ],
            [
                "affirmative_discretion_signals.affirmative_discretion_signals",
                "constraint_signals.constraint_evidence",
                "scope_and_centrality_assessment.scope_breadth",
                "scope_and_centrality_assessment.implementation_centrality",
                "scope_and_centrality_assessment.constraint_strength",
                "scope_and_centrality_assessment.scope_and_centrality_rationale",
            ],
            prompt_provenance=_prov(
                "Updates/new prompts/AI_EPR_Discretion_Cascade_Prompt8_v2.md",
                ["Use this sequence", "Definitions"],
                "workflow_split_from_source",
            ),
        ),
        _llm_node(
            "inventory_synthesis",
            "Inventory Synthesis",
            "Summarize the extracted evidence into a reusable inventory record that all three rank branches consume.",
            2530,
            860,
            INVENTORY_SYNTHESIS_PROMPT,
            [
                {"key": "inventory_rationale", "label": "Inventory rationale", "type": "string", "required": True},
                {"key": "inventory_evidence", "label": "Inventory evidence", "type": "evidence[]", "required": False},
                {"key": "inventory_boundary_focus", "label": "Inventory boundary focus", "type": "string", "required": True},
            ],
            [
                "actor_identification.administrative_actor",
                "delegated_authority_extraction.delegated_authority",
                "affirmative_discretion_signals.affirmative_discretion_signals",
                "constraint_signals.constraint_evidence",
                "scope_and_centrality_assessment.scope_breadth",
                "scope_and_centrality_assessment.implementation_centrality",
                "scope_and_centrality_assessment.constraint_strength",
                "residual_leeway_assessment.residual_leeway",
                "residual_leeway_assessment.residual_leeway_rationale",
            ],
            prompt_provenance=_prov(
                "Updates/new prompts/AI_EPR_Discretion_Cascade_Prompt8_v2.md",
                ["Use this sequence", "Affirmative discretion signals", "Constraint signals", "Anti-inflation rule"],
                "workflow_split_from_source",
            ),
        ),
        _llm_node(
            "cascade_stage_2_minimal_screen",
            "Cascade Stage 2 Minimal Screen",
            "Dedicated Stage 2 cascade node answering only whether the remaining discretion is below 2.",
            2870,
            300,
            CASCADE_STAGE_2_PROMPT,
            [
                {"key": "cascade_stage2_below_2", "label": "Cascade stage 2 below 2", "type": "boolean", "required": True},
                {"key": "cascade_stage2_rationale", "label": "Cascade stage 2 rationale", "type": "string", "required": True},
                {"key": "cascade_stage2_evidence", "label": "Cascade stage 2 evidence", "type": "evidence[]", "required": False},
            ],
            [
                "inventory_synthesis.inventory_rationale",
                "inventory_synthesis.inventory_boundary_focus",
                "delegated_authority_extraction.delegated_authority",
                "affirmative_discretion_signals.affirmative_discretion_signals",
                "constraint_signals.constraint_evidence",
                "scope_and_centrality_assessment.constraint_strength",
                "residual_leeway_assessment.residual_leeway",
            ],
            prompt_provenance=_prov(
                "Updates/new prompts/AI_EPR_Discretion_Cascade_Prompt8_v2.md",
                ["Stage 2: Minimal discretion screen", "Anti-inflation rule"],
                "verbatim_plus_output_schema",
            ),
        ),
        _condition_node(
            "cascade_stage_2_gate",
            "Cascade below 2?",
            "If Stage 2 is true, the cascade branch assigns provisional rank 1; otherwise it continues to Stage 3.",
            3180,
            300,
            "cascade_stage_2_minimal_screen.cascade_stage2_below_2",
            True,
            "Rank 1",
            "Continue to stage 3",
        ),
        _set_node(
            "cascade_stage_2_rank",
            "Set cascade provisional rank 1",
            "Set the cascade provisional rank after Stage 2 stops the branch.",
            3500,
            120,
            [
                {"field": "cascade_stage_reached", "type": "integer", "value": 2},
                {"field": "cascade_provisional_rank", "type": "integer", "value": 1},
            ],
        ),
        _llm_node(
            "cascade_stage_3_bounded_screen",
            "Cascade Stage 3 Bounded Screen",
            "Dedicated Stage 3 cascade node answering only whether the remaining discretion is below 3.",
            3500,
            420,
            CASCADE_STAGE_3_PROMPT,
            [
                {"key": "cascade_stage3_below_3", "label": "Cascade stage 3 below 3", "type": "boolean", "required": True},
                {"key": "cascade_stage3_rationale", "label": "Cascade stage 3 rationale", "type": "string", "required": True},
                {"key": "cascade_stage3_evidence", "label": "Cascade stage 3 evidence", "type": "evidence[]", "required": False},
            ],
            [
                "inventory_synthesis.inventory_rationale",
                "inventory_synthesis.inventory_boundary_focus",
                "delegated_authority_extraction.delegated_authority",
                "affirmative_discretion_signals.affirmative_discretion_signals",
                "constraint_signals.constraint_evidence",
                "scope_and_centrality_assessment.constraint_strength",
                "residual_leeway_assessment.residual_leeway",
            ],
            prompt_provenance=_prov(
                "Updates/new prompts/AI_EPR_Discretion_Cascade_Prompt8_v2.md",
                ["Stage 3: Limited versus substantial discretion screen", "Anti-inflation rule"],
                "verbatim_plus_output_schema",
            ),
        ),
        _condition_node(
            "cascade_stage_3_gate",
            "Cascade below 3?",
            "If Stage 3 is true, the cascade branch assigns provisional rank 2; otherwise it continues to Stage 4.",
            3810,
            420,
            "cascade_stage_3_bounded_screen.cascade_stage3_below_3",
            True,
            "Rank 2",
            "Continue to stage 4",
        ),
        _set_node(
            "cascade_stage_3_rank",
            "Set cascade provisional rank 2",
            "Set the cascade provisional rank after Stage 3 stops the branch.",
            4120,
            240,
            [
                {"field": "cascade_stage_reached", "type": "integer", "value": 3},
                {"field": "cascade_provisional_rank", "type": "integer", "value": 2},
            ],
        ),
        _llm_node(
            "cascade_stage_4_substantial_screen",
            "Cascade Stage 4 Substantial Screen",
            "Dedicated Stage 4 cascade node answering only whether the remaining discretion is below 4.",
            4120,
            540,
            CASCADE_STAGE_4_PROMPT,
            [
                {"key": "cascade_stage4_below_4", "label": "Cascade stage 4 below 4", "type": "boolean", "required": True},
                {"key": "cascade_stage4_rationale", "label": "Cascade stage 4 rationale", "type": "string", "required": True},
                {"key": "cascade_stage4_evidence", "label": "Cascade stage 4 evidence", "type": "evidence[]", "required": False},
            ],
            [
                "inventory_synthesis.inventory_rationale",
                "inventory_synthesis.inventory_boundary_focus",
                "delegated_authority_extraction.delegated_authority",
                "affirmative_discretion_signals.affirmative_discretion_signals",
                "constraint_signals.constraint_evidence",
                "scope_and_centrality_assessment.scope_breadth",
                "scope_and_centrality_assessment.implementation_centrality",
                "scope_and_centrality_assessment.constraint_strength",
                "residual_leeway_assessment.residual_leeway",
            ],
            prompt_provenance=_prov(
                "Updates/new prompts/AI_EPR_Discretion_Cascade_Prompt8_v2.md",
                ["Stage 4: Substantial versus high discretion screen", "Anti-inflation rule"],
                "verbatim_plus_output_schema",
            ),
        ),
        _condition_node(
            "cascade_stage_4_gate",
            "Cascade below 4?",
            "If Stage 4 is true, the cascade branch assigns provisional rank 3; otherwise it assigns provisional rank 4.",
            4430,
            540,
            "cascade_stage_4_substantial_screen.cascade_stage4_below_4",
            True,
            "Rank 3",
            "Rank 4",
        ),
        _set_node(
            "cascade_stage_4_rank_3",
            "Set cascade provisional rank 3",
            "Set the cascade provisional rank when Stage 4 stays below 4.",
            4740,
            420,
            [
                {"field": "cascade_stage_reached", "type": "integer", "value": 4},
                {"field": "cascade_provisional_rank", "type": "integer", "value": 3},
            ],
        ),
        _set_node(
            "cascade_stage_4_rank_4",
            "Set cascade provisional rank 4",
            "Set the cascade provisional rank when Stage 4 reaches the highest discretion category.",
            4740,
            660,
            [
                {"field": "cascade_stage_reached", "type": "integer", "value": 4},
                {"field": "cascade_provisional_rank", "type": "integer", "value": 4},
            ],
        ),
        _llm_node(
            "cascade_provisional_rank_normalizer",
            "Cascade Provisional Rank Normalizer",
            "Normalize the selected cascade stop-point into a reusable provisional-rank explanation.",
            5070,
            540,
            CASCADE_NORMALIZER_PROMPT,
            [
                {"key": "cascade_provisional_rank_normalization", "label": "Cascade provisional rank normalization", "type": "string", "required": True},
            ],
            [
                "cascade_stage_reached",
                "cascade_provisional_rank",
                "cascade_stage_2_minimal_screen.cascade_stage2_rationale",
                "cascade_stage_3_bounded_screen.cascade_stage3_rationale",
                "cascade_stage_4_substantial_screen.cascade_stage4_rationale",
                "inventory_synthesis.inventory_rationale",
            ],
            prompt_provenance=_prov(
                "Updates/new prompts/AI_EPR_Discretion_Cascade_Prompt8_v2.md",
                ["Stage 2: Minimal discretion screen", "Stage 3: Limited versus substantial discretion screen", "Stage 4: Substantial versus high discretion screen"],
                "workflow_split_from_source",
            ),
        ),
        _llm_node(
            "cascade_boundary_review",
            "Cascade Boundary Review",
            "Boundary review for the cascade path using the professor's explicit boundary rules.",
            5400,
            540,
            CASCADE_BOUNDARY_PROMPT,
            [
                {"key": "cascade_boundary_decision", "label": "Cascade boundary decision", "type": "string", "required": True},
                {"key": "cascade_boundary_bucket", "label": "Cascade boundary bucket", "type": "enum", "options": ["lower_25", "middle_50", "upper_25"], "required": True},
            ],
            [
                "cascade_stage_reached",
                "cascade_provisional_rank",
                "cascade_provisional_rank_normalizer.cascade_provisional_rank_normalization",
                "inventory_synthesis.inventory_boundary_focus",
                "scope_and_centrality_assessment.scope_breadth",
                "scope_and_centrality_assessment.implementation_centrality",
                "scope_and_centrality_assessment.constraint_strength",
                "residual_leeway_assessment.residual_leeway",
            ],
            prompt_provenance=_prov(
                "Updates/new prompts/AI_EPR_Discretion_Cascade_Prompt8_v2.md",
                ["Boundary rules", "Anti-inflation rule"],
                "verbatim_plus_output_schema",
            ),
        ),
        _llm_node(
            "cascade_recalibration_final",
            "Cascade Recalibration Final",
            "Final cascade rank after applying the professor's recalibration rule.",
            5730,
            540,
            CASCADE_RECALIBRATION_PROMPT,
            [
                {"key": "cascade_recalibration", "label": "Cascade recalibration", "type": "string", "required": True},
                {"key": "cascade_recalibration_delta", "label": "Cascade recalibration delta", "type": "integer", "required": True},
                {"key": "cascade_discretion_rank", "label": "Cascade discretion rank", "type": "integer", "required": True, "minimum": 0, "maximum": 4},
                {"key": "cascade_decision_rationale", "label": "Cascade decision rationale", "type": "string", "required": True},
            ],
            [
                "cascade_stage_reached",
                "cascade_provisional_rank",
                "cascade_boundary_review.cascade_boundary_decision",
                "cascade_boundary_review.cascade_boundary_bucket",
                "affirmative_discretion_signals.affirmative_discretion_signals",
                "constraint_signals.constraint_evidence",
                "scope_and_centrality_assessment.constraint_strength",
                "residual_leeway_assessment.residual_leeway",
            ],
            prompt_provenance=_prov(
                "Updates/new prompts/AI_EPR_Discretion_Cascade_Prompt8_v2.md",
                ["Recalibration rule"],
                "verbatim_plus_output_schema",
            ),
        ),
        _validation_node(
            "cascade_validation",
            "Cascade Validation",
            "Structural validation for the cascade branch outputs.",
            6050,
            540,
            [
                {
                    "name": "Cascade rank stays in range",
                    "expression": {"op": "in", "left": {"field": "cascade_recalibration_final.cascade_discretion_rank"}, "right": {"literal": [0, 1, 2, 3, 4]}},
                    "severity": "error",
                },
                {
                    "name": "Cascade recalibration delta stays bounded",
                    "expression": {"op": "in", "left": {"field": "cascade_recalibration_final.cascade_recalibration_delta"}, "right": {"literal": [-1, 0, 1]}},
                    "severity": "error",
                },
            ],
        ),
        _llm_node(
            "m9_rank_discipline_prep",
            "M9 Rank Discipline Prep",
            "Prepare the multiclass branch by organizing the rank-discipline evidence before choosing the provisional rank.",
            2870,
            860,
            M9_PREP_PROMPT,
            [
                {"key": "m9_rank_prep", "label": "M9 rank prep", "type": "string", "required": True},
                {"key": "m9_rank_evidence", "label": "M9 rank evidence", "type": "evidence[]", "required": False},
            ],
            [
                "inventory_synthesis.inventory_rationale",
                "inventory_synthesis.inventory_boundary_focus",
                "affirmative_discretion_signals.affirmative_discretion_signals",
                "constraint_signals.constraint_evidence",
                "scope_and_centrality_assessment.scope_breadth",
                "scope_and_centrality_assessment.implementation_centrality",
                "scope_and_centrality_assessment.constraint_strength",
                "residual_leeway_assessment.residual_leeway",
            ],
            prompt_provenance=_prov(
                "Updates/new prompts/m9.md",
                ["Rank Discipline", "Discretion Ranks", "Anti-inflation rule"],
                "workflow_split_from_source",
            ),
        ),
        _llm_node(
            "m9_multiclass_rank",
            "M9 Multiclass Rank",
            "Assign the multiclass provisional rank using the prepared rank discipline and shared inventory.",
            3210,
            860,
            M9_MULTICLASS_PROMPT,
            [
                {"key": "m9_provisional_rank", "label": "M9 provisional rank", "type": "integer", "required": True, "minimum": 1, "maximum": 4},
                {"key": "m9_provisional_rationale", "label": "M9 provisional rationale", "type": "string", "required": True},
            ],
            [
                "m9_rank_discipline_prep.m9_rank_prep",
                "m9_rank_discipline_prep.m9_rank_evidence",
                "inventory_synthesis.inventory_rationale",
                "affirmative_discretion_signals.affirmative_discretion_signals",
                "constraint_signals.constraint_evidence",
                "scope_and_centrality_assessment.scope_breadth",
                "scope_and_centrality_assessment.implementation_centrality",
                "scope_and_centrality_assessment.constraint_strength",
                "residual_leeway_assessment.residual_leeway",
            ],
            prompt_provenance=_prov(
                "Updates/new prompts/m9.md",
                ["Rank Discipline", "Discretion Ranks", "Anti-inflation rule"],
                "verbatim_plus_output_schema",
            ),
        ),
        _llm_node(
            "m9_boundary_review",
            "M9 Boundary Review",
            "Boundary review for the detailed multiclass branch.",
            3550,
            860,
            M9_BOUNDARY_PROMPT,
            [
                {"key": "m9_boundary_decision", "label": "M9 boundary decision", "type": "string", "required": True},
                {"key": "m9_boundary_bucket", "label": "M9 boundary bucket", "type": "enum", "options": ["lower_25", "middle_50", "upper_25"], "required": True},
            ],
            [
                "m9_multiclass_rank.m9_provisional_rank",
                "m9_multiclass_rank.m9_provisional_rationale",
                "inventory_synthesis.inventory_boundary_focus",
                "scope_and_centrality_assessment.constraint_strength",
                "residual_leeway_assessment.residual_leeway",
            ],
            prompt_provenance=_prov(
                "Updates/new prompts/m9.md",
                ["Boundary rules", "Anti-inflation rule"],
                "workflow_split_from_source",
            ),
        ),
        _llm_node(
            "m9_recalibration_final",
            "M9 Recalibration Final",
            "Apply the optional calibration logic to the multiclass branch for the detailed workflow.",
            3890,
            860,
            M9_RECALIBRATION_PROMPT,
            [
                {"key": "m9_recalibration", "label": "M9 recalibration", "type": "string", "required": True},
                {"key": "m9_recalibration_delta", "label": "M9 recalibration delta", "type": "integer", "required": True},
                {"key": "m9_discretion_rank", "label": "M9 discretion rank", "type": "integer", "required": True, "minimum": 0, "maximum": 4},
                {"key": "m9_decision_rationale", "label": "M9 decision rationale", "type": "string", "required": True},
            ],
            [
                "m9_multiclass_rank.m9_provisional_rank",
                "m9_multiclass_rank.m9_provisional_rationale",
                "m9_boundary_review.m9_boundary_decision",
                "m9_boundary_review.m9_boundary_bucket",
                "affirmative_discretion_signals.affirmative_discretion_signals",
                "constraint_signals.constraint_evidence",
                "scope_and_centrality_assessment.constraint_strength",
                "residual_leeway_assessment.residual_leeway",
            ],
            prompt_provenance=_prov(
                "Updates/new prompts/m9.md",
                ["Recalibration rule"],
                "workflow_split_from_source",
            ),
        ),
        _validation_node(
            "m9_validation",
            "M9 Validation",
            "Structural validation for the detailed multiclass branch outputs.",
            4210,
            860,
            [
                {
                    "name": "M9 rank stays in range",
                    "expression": {"op": "in", "left": {"field": "m9_recalibration_final.m9_discretion_rank"}, "right": {"literal": [0, 1, 2, 3, 4]}},
                    "severity": "error",
                },
                {
                    "name": "M9 recalibration delta stays bounded",
                    "expression": {"op": "in", "left": {"field": "m9_recalibration_final.m9_recalibration_delta"}, "right": {"literal": [-1, 0, 1]}},
                    "severity": "error",
                },
            ],
        ),
        _llm_node(
            "b3_coarse_band_screen",
            "B3 Coarse Band Screen",
            "Run the professor's binary decomposition by first splitting the law into the lower or higher band.",
            2870,
            1420,
            B3_BAND_PROMPT,
            [
                {"key": "b3_discretion_band", "label": "B3 discretion band", "type": "enum", "options": ["bounded", "agency"], "required": True},
                {"key": "b3_band_rationale", "label": "B3 band rationale", "type": "string", "required": True},
                {"key": "b3_band_evidence", "label": "B3 band evidence", "type": "evidence[]", "required": False},
            ],
            [
                "inventory_synthesis.inventory_rationale",
                "inventory_synthesis.inventory_boundary_focus",
                "affirmative_discretion_signals.affirmative_discretion_signals",
                "constraint_signals.constraint_evidence",
                "scope_and_centrality_assessment.scope_breadth",
                "scope_and_centrality_assessment.implementation_centrality",
                "scope_and_centrality_assessment.constraint_strength",
                "residual_leeway_assessment.residual_leeway",
            ],
            prompt_provenance=_prov(
                "Updates/new prompts/b3.md",
                ["Stage 2: 0=(1,2) vs. 1=(3,4)", "Anti-inflation rule"],
                "verbatim_plus_output_schema",
            ),
        ),
        _condition_node(
            "b3_bounded_band",
            "B3 bounded band?",
            "If the coarse band is bounded, split 1 vs 2. Otherwise split 3 vs 4.",
            3210,
            1420,
            "b3_coarse_band_screen.b3_discretion_band",
            "bounded",
            "Bounded band",
            "Agency band",
        ),
        _llm_node(
            "b3_low_band_split",
            "B3 Low Band Split",
            "Resolve the lower binary band into rank 1 or 2 using the professor's adjacent-rank guidance.",
            3550,
            1260,
            B3_LOW_SPLIT_PROMPT,
            [
                {"key": "b3_provisional_rank", "label": "B3 provisional rank", "type": "integer", "required": True, "minimum": 1, "maximum": 2},
                {"key": "b3_branch_rationale", "label": "B3 branch rationale", "type": "string", "required": True},
                {"key": "b3_branch_evidence", "label": "B3 branch evidence", "type": "evidence[]", "required": False},
            ],
            [
                "b3_coarse_band_screen.b3_discretion_band",
                "b3_coarse_band_screen.b3_band_rationale",
                "inventory_synthesis.inventory_rationale",
                "constraint_signals.constraint_evidence",
                "residual_leeway_assessment.residual_leeway",
            ],
            prompt_provenance=_prov(
                "Updates/new prompts/b3.md",
                ["Stage 3a: 0=1 vs. 1=2", "Anti-inflation rule"],
                "verbatim_plus_output_schema",
            ),
        ),
        _llm_node(
            "b3_high_band_split",
            "B3 High Band Split",
            "Resolve the higher binary band into rank 3 or 4 using the professor's adjacent-rank guidance.",
            3550,
            1580,
            B3_HIGH_SPLIT_PROMPT,
            [
                {"key": "b3_provisional_rank", "label": "B3 provisional rank", "type": "integer", "required": True, "minimum": 3, "maximum": 4},
                {"key": "b3_branch_rationale", "label": "B3 branch rationale", "type": "string", "required": True},
                {"key": "b3_branch_evidence", "label": "B3 branch evidence", "type": "evidence[]", "required": False},
            ],
            [
                "b3_coarse_band_screen.b3_discretion_band",
                "b3_coarse_band_screen.b3_band_rationale",
                "inventory_synthesis.inventory_rationale",
                "affirmative_discretion_signals.affirmative_discretion_signals",
                "scope_and_centrality_assessment.scope_breadth",
                "scope_and_centrality_assessment.implementation_centrality",
                "constraint_signals.constraint_evidence",
                "residual_leeway_assessment.residual_leeway",
            ],
            prompt_provenance=_prov(
                "Updates/new prompts/b3.md",
                ["Stage 3b: 0=3 vs. 1=4", "Anti-inflation rule"],
                "verbatim_plus_output_schema",
            ),
        ),
        _llm_node(
            "b3_provisional_rank_normalizer",
            "B3 Provisional Rank Normalizer",
            "Normalize the selected binary split into a single provisional-rank explanation.",
            3890,
            1420,
            B3_NORMALIZER_PROMPT,
            [
                {"key": "b3_normalized_provisional_rank", "label": "B3 normalized provisional rank", "type": "integer", "required": True, "minimum": 0, "maximum": 4},
                {"key": "b3_provisional_rank_normalization", "label": "B3 provisional rank normalization", "type": "string", "required": True},
            ],
            [
                "b3_coarse_band_screen.b3_discretion_band",
                "b3_coarse_band_screen.b3_band_rationale",
                "b3_low_band_split.b3_provisional_rank",
                "b3_low_band_split.b3_branch_rationale",
                "b3_high_band_split.b3_provisional_rank",
                "b3_high_band_split.b3_branch_rationale",
                "inventory_synthesis.inventory_rationale",
            ],
            prompt_provenance=_prov(
                "Updates/new prompts/b3.md",
                ["Stage 2: 0=(1,2) vs. 1=(3,4)", "Stage 3a: 0=1 vs. 1=2", "Stage 3b: 0=3 vs. 1=4"],
                "workflow_split_from_source",
            ),
        ),
        _llm_node(
            "b3_boundary_review",
            "B3 Boundary Review",
            "Boundary review for the binary path using the professor's shared boundary rules.",
            4230,
            1420,
            B3_BOUNDARY_PROMPT,
            [
                {"key": "b3_boundary_decision", "label": "B3 boundary decision", "type": "string", "required": True},
                {"key": "b3_boundary_bucket", "label": "B3 boundary bucket", "type": "enum", "options": ["lower_25", "middle_50", "upper_25"], "required": True},
            ],
            [
                "b3_coarse_band_screen.b3_discretion_band",
                "b3_coarse_band_screen.b3_band_rationale",
                "b3_provisional_rank_normalizer.b3_normalized_provisional_rank",
                "b3_provisional_rank_normalizer.b3_provisional_rank_normalization",
                "scope_and_centrality_assessment.constraint_strength",
                "residual_leeway_assessment.residual_leeway",
            ],
            prompt_provenance=_prov(
                "Updates/new prompts/b3.md",
                ["Boundary rules", "Anti-inflation rule"],
                "workflow_split_from_source",
            ),
        ),
        _llm_node(
            "b3_recalibration_final",
            "B3 Recalibration Final",
            "Final B3 rank after applying the professor's recalibration rule to the binary provisional rank.",
            4570,
            1420,
            B3_RECALIBRATION_PROMPT,
            [
                {"key": "b3_recalibration", "label": "B3 recalibration", "type": "string", "required": True},
                {"key": "b3_recalibration_delta", "label": "B3 recalibration delta", "type": "integer", "required": True},
                {"key": "b3_discretion_rank", "label": "B3 discretion rank", "type": "integer", "required": True, "minimum": 0, "maximum": 4},
                {"key": "b3_decision_rationale", "label": "B3 decision rationale", "type": "string", "required": True},
            ],
            [
                "b3_coarse_band_screen.b3_discretion_band",
                "b3_provisional_rank_normalizer.b3_normalized_provisional_rank",
                "b3_provisional_rank_normalizer.b3_provisional_rank_normalization",
                "b3_boundary_review.b3_boundary_decision",
                "b3_boundary_review.b3_boundary_bucket",
                "affirmative_discretion_signals.affirmative_discretion_signals",
                "constraint_signals.constraint_evidence",
                "scope_and_centrality_assessment.constraint_strength",
                "residual_leeway_assessment.residual_leeway",
            ],
            prompt_provenance=_prov(
                "Updates/new prompts/b3.md",
                ["Recalibration rule"],
                "workflow_split_from_source",
            ),
        ),
        _validation_node(
            "b3_validation",
            "B3 Validation",
            "Structural validation for the binary branch outputs.",
            4890,
            1420,
            [
                {
                    "name": "B3 rank stays in range",
                    "expression": {"op": "in", "left": {"field": "b3_recalibration_final.b3_discretion_rank"}, "right": {"literal": [0, 1, 2, 3, 4]}},
                    "severity": "error",
                },
                {
                    "name": "B3 recalibration delta stays bounded",
                    "expression": {"op": "in", "left": {"field": "b3_recalibration_final.b3_recalibration_delta"}, "right": {"literal": [-1, 0, 1]}},
                    "severity": "error",
                },
                {
                    "name": "Bounded band stays in 1 or 2",
                    "expression": {
                        "op": "or",
                        "args": [
                            {"op": "neq", "left": {"field": "b3_coarse_band_screen.b3_discretion_band"}, "right": {"literal": "bounded"}},
                            {"op": "in", "left": {"field": "b3_recalibration_final.b3_discretion_rank"}, "right": {"literal": [1, 2]}},
                        ],
                    },
                    "severity": "error",
                },
                {
                    "name": "Agency band stays in 3 or 4",
                    "expression": {
                        "op": "or",
                        "args": [
                            {"op": "neq", "left": {"field": "b3_coarse_band_screen.b3_discretion_band"}, "right": {"literal": "agency"}},
                            {"op": "in", "left": {"field": "b3_recalibration_final.b3_discretion_rank"}, "right": {"literal": [3, 4]}},
                        ],
                    },
                    "severity": "error",
                },
            ],
        ),
        _validation_node(
            "suite_validation",
            "Detailed Suite Validation",
            "Final structural checks across the detailed shared inventory and all three prompt-family branches.",
            6360,
            960,
            [
                {
                    "name": "High ranks require some upward evidence",
                    "expression": {
                        "op": "or",
                        "args": [
                            {"op": "in", "left": {"field": "cascade_recalibration_final.cascade_discretion_rank"}, "right": {"literal": [0, 1, 2, 3]}},
                            {"op": "present", "left": {"field": "affirmative_discretion_signals.affirmative_discretion_signals"}},
                        ],
                    },
                    "severity": "warning",
                },
                {
                    "name": "Residual leeway exists for rank 4 outcomes",
                    "expression": {
                        "op": "or",
                        "args": [
                            {"op": "neq", "left": {"field": "cascade_recalibration_final.cascade_discretion_rank"}, "right": {"literal": 4}},
                            {"op": "in", "left": {"field": "residual_leeway_assessment.residual_leeway"}, "right": {"literal": ["Substantial", "High"]}},
                        ],
                    },
                    "severity": "warning",
                },
            ],
        ),
        {
            "id": "dashboard_output",
            "kind": "output",
            "name": "Dashboard output",
            "description": "Expose the detailed shared inventory and branch outputs as dashboard columns and subcolumns.",
            "position": {"x": 6700, "y": 960},
            "config": {
                "fields": [
                    _output_field("delegate_law", "delegate_law", "Delegate Law"),
                    _output_field("delegation_rationale", "delegation_rationale", "Delegation Rationale"),
                    _output_field("delegation_evidence", "delegation_evidence", "Delegation Evidence"),
                    _output_field("administrative_actor", "administrative_actor", "Administrative Actor"),
                    _output_field("actor_identification_rationale", "actor_identification_rationale", "Actor Identification Rationale"),
                    _output_field("actor_evidence", "actor_evidence", "Actor Evidence"),
                    _output_field("delegated_authority", "delegated_authority", "Delegated Authority"),
                    _output_field("delegated_authority_rationale", "delegated_authority_rationale", "Delegated Authority Rationale"),
                    _output_field("delegated_authority_evidence", "delegated_authority_evidence", "Delegated Authority Evidence"),
                    _output_field("affirmative_discretion_signals", "affirmative_discretion_signals", "Affirmative Discretion Signals"),
                    _output_field("affirmative_signal_rationale", "affirmative_signal_rationale", "Affirmative Signal Rationale"),
                    _output_field("affirmative_signal_evidence", "affirmative_signal_evidence", "Affirmative Signal Evidence"),
                    _output_field("constraint_evidence", "constraint_evidence", "Constraint Evidence"),
                    _output_field("constraint_signal_rationale", "constraint_signal_rationale", "Constraint Signal Rationale"),
                    _output_field("constraint_signal_evidence", "constraint_signal_evidence", "Constraint Signal Evidence"),
                    _output_field("scope_breadth", "scope_breadth", "Scope Breadth"),
                    _output_field("implementation_centrality", "implementation_centrality", "Implementation Centrality"),
                    _output_field("constraint_strength", "constraint_strength", "Constraint Strength"),
                    _output_field("scope_and_centrality_rationale", "scope_and_centrality_rationale", "Scope and Centrality Rationale"),
                    _output_field("residual_leeway", "residual_leeway", "Residual Leeway"),
                    _output_field("residual_leeway_rationale", "residual_leeway_rationale", "Residual Leeway Rationale"),
                    _output_field("inventory_rationale", "inventory_rationale", "Inventory Rationale"),
                    _output_field("inventory_evidence", "inventory_evidence", "Inventory Evidence"),
                    _output_field("inventory_boundary_focus", "inventory_boundary_focus", "Inventory Boundary Focus"),
                    _output_field("cascade_stage2_below_2", "cascade_stage2_below_2", "Cascade Stage 2 Below 2"),
                    _output_field("cascade_stage2_rationale", "cascade_stage2_rationale", "Cascade Stage 2 Rationale"),
                    _output_field("cascade_stage2_evidence", "cascade_stage2_evidence", "Cascade Stage 2 Evidence"),
                    _output_field("cascade_stage3_below_3", "cascade_stage3_below_3", "Cascade Stage 3 Below 3"),
                    _output_field("cascade_stage3_rationale", "cascade_stage3_rationale", "Cascade Stage 3 Rationale"),
                    _output_field("cascade_stage3_evidence", "cascade_stage3_evidence", "Cascade Stage 3 Evidence"),
                    _output_field("cascade_stage4_below_4", "cascade_stage4_below_4", "Cascade Stage 4 Below 4"),
                    _output_field("cascade_stage4_rationale", "cascade_stage4_rationale", "Cascade Stage 4 Rationale"),
                    _output_field("cascade_stage4_evidence", "cascade_stage4_evidence", "Cascade Stage 4 Evidence"),
                    _output_field("cascade_stage_reached", "cascade_stage_reached", "Cascade Stage Reached"),
                    _output_field("cascade_provisional_rank", "cascade_provisional_rank", "Cascade Provisional Rank"),
                    _output_field("cascade_provisional_rank_normalization", "cascade_provisional_rank_normalization", "Cascade Provisional Rank Normalization"),
                    _output_field("cascade_boundary_decision", "cascade_boundary_decision", "Cascade Boundary Decision"),
                    _output_field("cascade_boundary_bucket", "cascade_boundary_bucket", "Cascade Boundary Bucket"),
                    _output_field("cascade_recalibration", "cascade_recalibration", "Cascade Recalibration"),
                    _output_field("cascade_recalibration_delta", "cascade_recalibration_delta", "Cascade Recalibration Delta"),
                    _output_field("cascade_discretion_rank", "cascade_discretion_rank", "Cascade Discretion Rank"),
                    _output_field("cascade_decision_rationale", "cascade_decision_rationale", "Cascade Decision Rationale"),
                    _output_field("m9_rank_prep", "m9_rank_prep", "M9 Rank Prep"),
                    _output_field("m9_rank_evidence", "m9_rank_evidence", "M9 Rank Evidence"),
                    _output_field("m9_provisional_rank", "m9_provisional_rank", "M9 Provisional Rank"),
                    _output_field("m9_provisional_rationale", "m9_provisional_rationale", "M9 Provisional Rationale"),
                    _output_field("m9_boundary_decision", "m9_boundary_decision", "M9 Boundary Decision"),
                    _output_field("m9_boundary_bucket", "m9_boundary_bucket", "M9 Boundary Bucket"),
                    _output_field("m9_recalibration", "m9_recalibration", "M9 Recalibration"),
                    _output_field("m9_recalibration_delta", "m9_recalibration_delta", "M9 Recalibration Delta"),
                    _output_field("m9_discretion_rank", "m9_discretion_rank", "M9 Discretion Rank"),
                    _output_field("m9_decision_rationale", "m9_decision_rationale", "M9 Decision Rationale"),
                    _output_field("b3_discretion_band", "b3_discretion_band", "B3 Discretion Band"),
                    _output_field("b3_band_rationale", "b3_band_rationale", "B3 Band Rationale"),
                    _output_field("b3_band_evidence", "b3_band_evidence", "B3 Band Evidence"),
                    _output_field("b3_provisional_rank", "b3_provisional_rank", "B3 Provisional Rank"),
                    _output_field("b3_branch_rationale", "b3_branch_rationale", "B3 Branch Rationale"),
                    _output_field("b3_branch_evidence", "b3_branch_evidence", "B3 Branch Evidence"),
                    _output_field("b3_provisional_rank_normalization", "b3_provisional_rank_normalization", "B3 Provisional Rank Normalization"),
                    _output_field("b3_boundary_decision", "b3_boundary_decision", "B3 Boundary Decision"),
                    _output_field("b3_boundary_bucket", "b3_boundary_bucket", "B3 Boundary Bucket"),
                    _output_field("b3_recalibration", "b3_recalibration", "B3 Recalibration"),
                    _output_field("b3_recalibration_delta", "b3_recalibration_delta", "B3 Recalibration Delta"),
                    _output_field("b3_discretion_rank", "b3_discretion_rank", "B3 Discretion Rank"),
                    _output_field("b3_decision_rationale", "b3_decision_rationale", "B3 Decision Rationale"),
                ]
            },
        },
    ]

    edges = [
        {"id": "e-input-gate", "source": "document_input", "target": "prompt_v8_delegation_gate"},
        {"id": "e-gate-branch", "source": "prompt_v8_delegation_gate", "target": "delegation_found"},
        {"id": "e-no-delegation", "source": "delegation_found", "target": "no_delegation_defaults", "source_handle": "true", "label": "No delegation"},
        {"id": "e-yes-delegation-actors", "source": "delegation_found", "target": "actor_identification", "source_handle": "false", "label": "Delegation found"},
        {"id": "e-actors-authority", "source": "actor_identification", "target": "delegated_authority_extraction"},
        {"id": "e-authority-affirmative", "source": "delegated_authority_extraction", "target": "affirmative_discretion_signals"},
        {"id": "e-authority-constraints", "source": "delegated_authority_extraction", "target": "constraint_signals"},
        {"id": "e-affirmative-scope", "source": "affirmative_discretion_signals", "target": "scope_and_centrality_assessment"},
        {"id": "e-constraints-scope", "source": "constraint_signals", "target": "scope_and_centrality_assessment"},
        {"id": "e-scope-residual", "source": "scope_and_centrality_assessment", "target": "residual_leeway_assessment"},
        {"id": "e-residual-inventory", "source": "residual_leeway_assessment", "target": "inventory_synthesis"},
        {"id": "e-inventory-cascade", "source": "inventory_synthesis", "target": "cascade_stage_2_minimal_screen"},
        {"id": "e-stage2-gate", "source": "cascade_stage_2_minimal_screen", "target": "cascade_stage_2_gate"},
        {"id": "e-stage2-rank1", "source": "cascade_stage_2_gate", "target": "cascade_stage_2_rank", "source_handle": "true", "label": "Rank 1"},
        {"id": "e-stage2-stage3", "source": "cascade_stage_2_gate", "target": "cascade_stage_3_bounded_screen", "source_handle": "false", "label": "Continue"},
        {"id": "e-stage3-gate", "source": "cascade_stage_3_bounded_screen", "target": "cascade_stage_3_gate"},
        {"id": "e-stage3-rank2", "source": "cascade_stage_3_gate", "target": "cascade_stage_3_rank", "source_handle": "true", "label": "Rank 2"},
        {"id": "e-stage3-stage4", "source": "cascade_stage_3_gate", "target": "cascade_stage_4_substantial_screen", "source_handle": "false", "label": "Continue"},
        {"id": "e-stage4-gate", "source": "cascade_stage_4_substantial_screen", "target": "cascade_stage_4_gate"},
        {"id": "e-stage4-rank3", "source": "cascade_stage_4_gate", "target": "cascade_stage_4_rank_3", "source_handle": "true", "label": "Rank 3"},
        {"id": "e-stage4-rank4", "source": "cascade_stage_4_gate", "target": "cascade_stage_4_rank_4", "source_handle": "false", "label": "Rank 4"},
        {"id": "e-stage2-normalizer", "source": "cascade_stage_2_rank", "target": "cascade_provisional_rank_normalizer"},
        {"id": "e-stage3-normalizer", "source": "cascade_stage_3_rank", "target": "cascade_provisional_rank_normalizer"},
        {"id": "e-stage4-rank3-normalizer", "source": "cascade_stage_4_rank_3", "target": "cascade_provisional_rank_normalizer"},
        {"id": "e-stage4-rank4-normalizer", "source": "cascade_stage_4_rank_4", "target": "cascade_provisional_rank_normalizer"},
        {"id": "e-cascade-boundary", "source": "cascade_provisional_rank_normalizer", "target": "cascade_boundary_review"},
        {"id": "e-cascade-recalibration", "source": "cascade_boundary_review", "target": "cascade_recalibration_final"},
        {"id": "e-cascade-validation", "source": "cascade_recalibration_final", "target": "cascade_validation"},
        {"id": "e-inventory-m9-prep", "source": "inventory_synthesis", "target": "m9_rank_discipline_prep"},
        {"id": "e-m9-prep-rank", "source": "m9_rank_discipline_prep", "target": "m9_multiclass_rank"},
        {"id": "e-m9-rank-boundary", "source": "m9_multiclass_rank", "target": "m9_boundary_review"},
        {"id": "e-m9-boundary-recalibration", "source": "m9_boundary_review", "target": "m9_recalibration_final"},
        {"id": "e-m9-validation", "source": "m9_recalibration_final", "target": "m9_validation"},
        {"id": "e-inventory-b3-band", "source": "inventory_synthesis", "target": "b3_coarse_band_screen"},
        {"id": "e-b3-gate", "source": "b3_coarse_band_screen", "target": "b3_bounded_band"},
        {"id": "e-b3-low", "source": "b3_bounded_band", "target": "b3_low_band_split", "source_handle": "true", "label": "Bounded"},
        {"id": "e-b3-high", "source": "b3_bounded_band", "target": "b3_high_band_split", "source_handle": "false", "label": "Agency"},
        {"id": "e-b3-low-normalizer", "source": "b3_low_band_split", "target": "b3_provisional_rank_normalizer"},
        {"id": "e-b3-high-normalizer", "source": "b3_high_band_split", "target": "b3_provisional_rank_normalizer"},
        {"id": "e-b3-boundary", "source": "b3_provisional_rank_normalizer", "target": "b3_boundary_review"},
        {"id": "e-b3-recalibration", "source": "b3_boundary_review", "target": "b3_recalibration_final"},
        {"id": "e-b3-validation", "source": "b3_recalibration_final", "target": "b3_validation"},
        {"id": "e-no-delegation-suite-validation", "source": "no_delegation_defaults", "target": "suite_validation"},
        {"id": "e-cascade-suite-validation", "source": "cascade_validation", "target": "suite_validation"},
        {"id": "e-m9-suite-validation", "source": "m9_validation", "target": "suite_validation"},
        {"id": "e-b3-suite-validation", "source": "b3_validation", "target": "suite_validation"},
        {"id": "e-suite-output", "source": "suite_validation", "target": "dashboard_output"},
    ]

    outputs = [
        _workflow_output("delegate_law", "delegate_law", "Shared"),
        _workflow_output("administrative_actor", "administrative_actor", "Shared"),
        _workflow_output("delegated_authority", "delegated_authority", "Shared"),
        _workflow_output("affirmative_discretion_signals", "affirmative_discretion_signals", "Shared"),
        _workflow_output("constraint_evidence", "constraint_evidence", "Shared"),
        _workflow_output("scope_breadth", "scope_breadth", "Shared"),
        _workflow_output("implementation_centrality", "implementation_centrality", "Shared"),
        _workflow_output("constraint_strength", "constraint_strength", "Shared"),
        _workflow_output("residual_leeway", "residual_leeway", "Shared"),
        _workflow_output("inventory_rationale", "inventory_rationale", "Shared"),
        _workflow_output("cascade_stage_reached", "cascade_stage_reached", "Cascade"),
        _workflow_output("cascade_provisional_rank", "cascade_provisional_rank", "Cascade"),
        _workflow_output("cascade_discretion_rank", "cascade_discretion_rank", "Cascade"),
        _workflow_output("cascade_boundary_bucket", "cascade_boundary_bucket", "Cascade"),
        _workflow_output("cascade_decision_rationale", "cascade_decision_rationale", "Cascade"),
        _workflow_output("m9_provisional_rank", "m9_provisional_rank", "M9"),
        _workflow_output("m9_discretion_rank", "m9_discretion_rank", "M9"),
        _workflow_output("m9_boundary_bucket", "m9_boundary_bucket", "M9"),
        _workflow_output("m9_decision_rationale", "m9_decision_rationale", "M9"),
        _workflow_output("b3_discretion_band", "b3_discretion_band", "B3"),
        _workflow_output("b3_provisional_rank", "b3_provisional_rank", "B3"),
        _workflow_output("b3_discretion_rank", "b3_discretion_rank", "B3"),
        _workflow_output("b3_boundary_bucket", "b3_boundary_bucket", "B3"),
        _workflow_output("b3_decision_rationale", "b3_decision_rationale", "B3"),
    ]

    return {
        "schema_version": 1,
        "nodes": nodes,
        "edges": edges,
        "outputs": outputs,
        "viewport": {"x": 0, "y": 0, "zoom": 0.35},
        "metadata": {
            "workflow_family": "professor_discretion_prompt_suite_detailed",
            "prompt_source_rule": "body_over_filename",
            "prompt_strategy": "accuracy_oriented_multi_step",
            "notes": [
                "This suite keeps the current compact professor workflow unchanged and exposes a separate accuracy-oriented detailed workflow.",
                "Shared inventory nodes are intentionally narrower than the original compact suite to improve input discipline and downstream rank control.",
            ],
        },
    }
