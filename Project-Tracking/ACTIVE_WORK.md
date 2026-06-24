# Active Work

This file tracks current unresolved work. Keep entries short, owned by a clear next action, and remove them when resolved.

## How To Add An Item

Use this format:

```md
## YYYY-MM-DD - Short Title

Status: Open | In Progress | Blocked | Needs Review
Area: Product | Research | Backend | Frontend | Data | Prompting | Testing

Problem:
Short description of what is wrong or uncertain.

Why It Matters:
Why this affects the product or research workflow.

Next Action:
The next concrete step.
```

## 2026-06-20 - Benchmark Tracking Needs Formalization

Status: In Progress
Area: Product

Problem:
The project currently has benchmark expectations, prompt versions, source documents, and run results spread across conversations, prompts, and the local database.

Why It Matters:
Without a formal benchmark tracker, future agents may confuse stale incidents with active problems or lose the history of why a calibration decision was made.

Next Action:
Use `Project-Tracking/BENCHMARK_LOG.md` for current benchmark cases and evolve it into a fuller runner/export format as the workflow stabilizes.

## 2026-06-20 - Stage 1 Delegation Calibration

Status: In Progress
Area: Research

Problem:
The first-stage delegation field still needs repeatable validation against the professor's benchmark labels.

Why It Matters:
The broader discretion workflow should not expand until the first binary delegation task is stable enough to inspect and reproduce.

Next Action:
Run a controlled summary-based benchmark using the current prompt, record mismatches in a benchmark tracker, and resolve each mismatch as prompt issue, data issue, benchmark ambiguity, or model limitation.

## 2026-06-20 - Move Beyond Prompt-Only Classification

Status: Open
Area: Product

Problem:
Prompt versions trade off false-class recall against true-class recall, and prompt-only tuning is unlikely to be robust enough for larger-scale coding.

Why It Matters:
The product needs a repeatable coding system with benchmark tracking, active review, evidence extraction, prompt/model versioning, and possibly learned calibration over time.

Next Action:
Use `Project-Tracking/METHODOLOGY_STRATEGY.md` as the strategy log, then choose the first implementation milestone: benchmark runner, error taxonomy, active review queue, or staged coding pipeline.


## 2026-06-20 - Specific Negative Benchmark Case

Status: Needs Review
Area: Prompting

Problem:
One known negative benchmark example has been useful for detecting whether the model is using an overly broad delegation definition.

Why It Matters:
This is an example-level calibration check, not a permanent project principle. It should be tracked here until the benchmark runner can encode it formally.

Next Action:
Track this in `Project-Tracking/BENCHMARK_LOG.md` until it is either resolved by prompt changes, resolved by source-document correction, or formalized in an automated benchmark set.

## 2026-06-22 - Reusable Coding Workflow Engine

Status: Needs Review
Area: Product

Problem:
Campaigns currently duplicate prompts and column schemas even when multiple document sets use the same evaluation method. Dependencies cannot express deterministic branches, multi-field stage outputs, minimal LLM context, or reusable/versioned research protocols.

Why It Matters:
The delegation and discretion work is a staged quantitative coding methodology. It must be reusable, benchmarkable, inspectable, cost-aware, and pinned to immutable versions for research reproducibility.

Next Action:
Visually review the standalone Workflow Library, Builder, and `Law Delegation + Discretion Rank` template, then approve Phase 3 campaign adoption. Do not modify current campaign execution until that approval.
