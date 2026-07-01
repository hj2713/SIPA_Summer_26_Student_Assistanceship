# Cascade Prompt8.v2 — Discretion Classification with Calibration

You are coding a financial regulation law for delegated administrative discretion.

The input is a law-level summary or statutory text. Code only the text supplied. Do not infer authority from background law, legislative history, or general knowledge unless the supplied text expressly incorporates it. Analyze only financial-regulation portions of the supplied text.

Your task is to classify the law into one Rough Guide discretion rank from 0 to 4.

Use this sequence: inventory first, judge second, rank last. First identify delegation. Second identify affirmative discretion signals. Third identify the delegated authority. Fourth identify constraints on that authority. Fifth assess residual agency leeway after constraints. Sixth assign a provisional rank. Seventh apply boundary and recalibration rules. Eighth assign the final calibrated rank.

## Definitions

Delegation means the law gives a U.S. federal agency, independent commission, executive branch actor, the President, or another administrative actor authority or responsibility to act. Delegated authority may include authority to implement, administer, enforce, supervise, regulate, interpret, approve, deny, waive, exempt, investigate, issue rules, set standards, make determinations, or carry out statutory responsibilities.

Discretion means the delegated actor has room to choose policy, standards, enforcement priorities, exemptions, interpretations, approvals, waivers, supervision methods, implementation details, or regulatory scope.

Constraint means the law limits, channels, reviews, conditions, or structures the use of delegated authority. Constraints include reporting requirements; consultation requirements; substantive standards; rulemaking procedures, findings, or deadlines; spending limits; time limits or sunset provisions; exemptions limiting scope; appeals procedures; direct oversight; public hearing requirements; approval requirements; and limits on waiver, exemption, enforcement, supervisory, or interpretive authority.

A mere mention of an agency is not delegation unless the law gives that agency authority or responsibility to act. A mandatory ministerial duty may count as delegation, but usually implies low discretion. A rulemaking command counts as delegation. It counts as a constraint only if the law also provides substantive standards, required procedures, deadlines, findings, consultation duties, approval requirements, review mechanisms, or limits on rulemaking authority.

If evidence is ambiguous, choose the lower discretion category unless the supplied text clearly supports the higher category.

## Rank Discipline

Rank 0: No delegated discretion. The law does not give an agency meaningful authority to decide legal obligations, benefits, standards, approvals, enforcement, or implementation choices.

Rank 1: Minimal discretion. The agency performs a narrow, ministerial, procedural, reporting, administrative, or implementation role. Any judgment is highly bounded by statutory text.

Rank 2: Bounded discretion. The agency has real authority, but the statute gives meaningful limits through criteria, formulas, narrow scope, procedural requirements, fixed triggers, defined objectives, or oversight. This is the default rank when agency authority exists but is substantially constrained.

Rank 3: Substantial discretion. The agency can make meaningful policy choices, define standards, grant exemptions, set conditions, or shape implementation across a significant domain. Statutory constraints exist but do not determine the outcome.

Rank 4: High discretion. The agency receives broad, durable, policy-shaping authority with few meaningful statutory constraints. Use this rank only when the statute leaves major substantive choices to the agency.

## Cascade

Stage 1: Delegation screen.
Question: Does the law delegate authority to an agency, executive actor, or administrative actor?
If no, assign Provisional_Rank: 0 and Final_Discretion_Rank: 0 and stop.
If yes, continue.

Stage 2: Minimal discretion screen.
Question: After identifying constraints, is the remaining discretion below 2?
Answer yes if the delegated role is narrow, mechanical, procedural, ministerial, administrative, or tightly constrained. This includes reporting, transmitting information, applying a clear formula, carrying out a fixed duty, or administering details where Congress already specified the substantive rule.
If yes, assign Provisional_Rank: 1 and continue to boundary/recalibration review.
If no, continue.
Burden rule: default to rank 1 unless the text clearly shows real agency judgment beyond narrow implementation.

Stage 3: Limited versus substantial discretion screen.
Question: After identifying constraints, is the remaining discretion below 3?
Answer yes if the law delegates real implementation, supervisory, regulatory, enforcement, or administrative authority, but that authority is bounded by significant statutory rules, standards, deadlines, reporting duties, consultation requirements, exemptions, appeals, oversight, approval requirements, or limits on waiver, enforcement, supervision, interpretation, or regulatory scope.
If yes, assign Provisional_Rank: 2 and continue to boundary/recalibration review.
If no, continue.
Burden rule: default to rank 2 unless the text clearly shows substantial agency choice over policy standards, enforcement priorities, supervisory methods, exemptions, waivers, interpretations, approvals, or regulatory scope. Do not move above rank 2 merely because the law gives rulemaking, enforcement, supervisory, or implementation authority.

Stage 4: Substantial versus high discretion screen.
Question: After identifying constraints, is the remaining discretion below 4?
Answer yes if the law delegates meaningful authority to interpret, implement, enforce, supervise, regulate, approve, waive, exempt, or set standards, but the authority is not broad, central, and weakly constrained enough to qualify as high discretion.
If yes, assign Provisional_Rank: 3 and continue to boundary/recalibration review.
If no, assign Provisional_Rank: 4 and continue to boundary/recalibration review.
Burden rule: default to rank 3 unless the text clearly shows broad, central, weakly constrained policymaking discretion. Do not assign rank 4 simply because the law delegates broad authority. Rank 4 requires broad or central delegation plus limited or weak constraints.

## Calibration Module

### Affirmative discretion signals

Identify statutory features that increase agency discretion. Consider whether the law gives the agency authority to set substantive standards or rules; choose among policy alternatives; define eligibility, scope, thresholds, or compliance obligations; grant, deny, waive, exempt, approve, condition, or enforce; interpret broad statutory terms; act repeatedly or across a broad class of cases; exercise authority without detailed statutory formulas or fixed criteria; or shape implementation in ways that materially affect regulated parties or beneficiaries.

### Constraint signals

Identify statutory features that limit agency discretion. Consider whether the law specifies fixed formulas, deadlines, amounts, thresholds, or triggers; limits authority to a narrow product, institution, transaction, program, or factual condition; requires agency action but leaves little choice over substance; provides detailed statutory criteria that determine or strongly structure the outcome; requires reports, consultation, findings, hearings, review, or procedural steps; includes sunset provisions, temporary authority, or narrow emergency conditions; assigns authority mainly to implement, administer, publish, transmit, conform, or report; or requires approval by another institutional actor before action becomes effective.

### Boundary rules

1-vs-2 boundary: Use Rank 1 rather than Rank 2 when the agency role is mainly ministerial, administrative, reporting, publishing, recordkeeping, or mechanical implementation. Use Rank 2 rather than Rank 1 when the agency makes real determinations, approvals, adjustments, waivers, enforcement choices, or implementation choices that affect legal or practical outcomes.

2-vs-3 boundary: Use Rank 2 rather than Rank 3 when Congress specifies the core policy choice; the agency applies statutory criteria rather than defining them; the authority is limited to a narrow class of entities, products, transactions, or facts; the statute requires findings, reports, consultation, hearings, or procedures that materially structure the decision; or the law authorizes implementation rather than broad policy design. Use Rank 3 rather than Rank 2 only when the agency can define, adjust, or choose substantive policy content within the statutory scheme.

3-vs-4 boundary: Use Rank 3 rather than Rank 4 when the agency has broad authority but must operate within a defined statutory program; the statute provides policy goals, criteria, procedures, or scope limits; the agency discretion is important but not open-ended; or the authority applies to a defined sector, program, or regulatory problem. Use Rank 4 only when the agency receives open-ended, policy-shaping authority with few meaningful statutory constraints.

### Anti-inflation rule

Do not assign Rank 3 or Rank 4 merely because the statute uses broad words such as regulate, prescribe, determine, approve, exempt, waive, modify, issue rules, as necessary, or in the public interest. These words indicate possible discretion, but they do not by themselves establish substantial or high discretion. A Rank 3 or Rank 4 requires evidence that the agency can make broad substantive policy choices, not merely administer a statutory scheme. When the evidence is mixed, prefer the lower rank unless the statute clearly gives the agency open-ended or substantial policy-making authority.

### Recalibration rule

After assigning the provisional rank, assess whether the case lies near the boundary between two adjacent ranks.

Use the strength of the affirmative discretion signals and the strength of the constraint signals to determine whether the provisional rank should be adjusted.

If the evidence places the case in the lower 25 percent of the provisional rank, lower the prediction by one rank.

If the evidence places the case in the upper 25 percent of the provisional rank, raise the prediction by one rank.

If the evidence falls in the middle 50 percent of the provisional rank, retain the provisional rank as predicted.

Do not recalibrate by more than one rank. Do not recalibrate Rank 0 downward. Do not recalibrate Rank 4 upward. Do not recalibrate Rank 0 upward unless there is clear evidence of delegated authority.

When moving upward from Rank 2 to Rank 3, or from Rank 3 to Rank 4, require clear evidence that the agency has broad substantive policy choice, not merely implementation authority, procedural authority, or bounded administrative judgment.

When moving downward from Rank 3 to Rank 2, give weight to statutory criteria, formulas, narrow scope, procedural requirements, reporting duties, consultation requirements, sunsets, fixed triggers, and defined statutory objectives.

## Output Format

Return only the following fields:

DelegateLaw: Y/N
Stage_Reached: 1/2/3/4
Provisional_Rank: 0/1/2/3/4
Discretion_Rank: 0/1/2/3/4
Agency_or_Actor:
Delegated_Authority:
Affirmative_Discretion_Signals:
Constraint_Evidence:
Residual_Leeway: None/Low/Bounded/Substantial/High
Boundary_Decision:
Recalibration:
Decision_Rationale:

Keep Decision_Rationale to 1 or 2 sentences. Do not provide any additional text.

# Financial regulation law summary:
{Input_Text}
