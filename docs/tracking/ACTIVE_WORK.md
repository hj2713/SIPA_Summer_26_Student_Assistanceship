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

## 2026-11-06 - Workflow Model Evaluation Race Condition on `coded_values`

Status: Open
Area: Backend

Problem:
When a model comparison workflow runs multiple models in parallel on the same document (e.g. `openai/gpt-5.5` and `deepseek/deepseek-v4-flash`), the background worker claims and runs both jobs concurrently via `asyncio.gather`. Each task reads `coded_values` at start. When a faster model finishes (~18s, 132 fields), it persists its output to `dashboard_documents`. When a slower model finishes later (~3m, 133 fields), its in-memory snapshot of `all_coded` still has the faster model as `pending`. Writing back to PostgreSQL overwrites the faster model's completed output with empty values, leaving the document stuck in `"processing"`.

Why It Matters:
Cloud evaluations executed from the frontend (`/evaluation/:id`) appear stuck or missing model outputs even though LLM inference completed successfully and `workflow_jobs` marked both jobs completed.

Next Action:
In [`WorkflowDashboardService`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/services/workflow_dashboard_service.py#L28-L50), re-fetch the latest `coded_values` from the database immediately prior to updating `dashboard_documents`, or use PostgreSQL atomic JSONB update / row locking (`SELECT ... FOR UPDATE`) to merge model outputs safely. For the affected evaluation `4568634e-6d67-4ce7-98a3-61dc0c619707`, trigger a retry specifically for `deepseek/deepseek-v4-flash`.

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
