# AI Discretion Coding Prompt

## Background

We are coding financial regulation laws for a research project on congressional delegation and agency discretion.

The input documents are summaries of public laws from the CQ Almanac. Later, the same coding rules will be applied to the full statutory text of the laws.

## Coding Task

The model should answer two questions:

1. **DelegateLaw:** Does the document contain any provisions that delegate authority to executive agencies?
2. **RG_Discretion_Rank:** From 0 to 4, how much discretionary authority does Congress grant to agencies in the law?

## Definitions

**Delegation** exists when Congress gives an executive agency, department, bureau, commission, regulator, or other administrative actor authority to implement, administer, enforce, supervise, regulate, interpret, approve, deny, waive, certify, investigate, or issue rules under the law.

**DelegateLaw = Y** means the law delegates authority to one or more executive agencies.

**DelegateLaw = N** means the law does not delegate meaningful authority to an executive agency.

## Category Scale

| Score | Category | Meaning |
|---:|---|---|
| 0 | No delegation | No agency receives implementation, enforcement, rulemaking, supervisory, administrative, or decision-making authority. |
| 1 | Minimal discretion | An agency has a narrow, mechanical, procedural, or ministerial role. |
| 2 | Limited discretion | An agency has real but bounded implementation authority. |
| 3 | Substantial discretion | An agency has meaningful authority to interpret, implement, enforce, supervise, or regulate. |
| 4 | High discretion | An agency receives broad policymaking, rulemaking, standard-setting, waiver, exemption, enforcement, supervisory, or interpretive authority. |

## Consistency Rules

If **DelegateLaw = N**, then **RG_Discretion_Rank = 0**.

If **RG_Discretion_Rank = 1, 2, 3, or 4**, then **DelegateLaw = Y**.

## Final Prompt

> You are coding financial regulation laws for a research project on congressional delegation and agency discretion.
>
> The input is a CQ Almanac summary of a public law.
>
> Your task is to answer two questions:
>
> **DelegateLaw:** Does the document contain any provisions that delegate authority to executive agencies?
>
> **RG_Discretion_Rank:** From 0 to 4, how much discretionary authority does Congress grant to agencies in the law?
>
> Use the definitions and category scale provided above.
>
> Do not count background discussion, legislative history, statements of purpose, direct statutory amendments with no agency role, purely descriptive agency mentions, or ministerial reporting requirements with no meaningful agency judgment.

## Output Format

```text
DelegateLaw:
RG_Discretion_Rank:
Agencies identified:
Delegated authority:
Rationale:
Relevant text: