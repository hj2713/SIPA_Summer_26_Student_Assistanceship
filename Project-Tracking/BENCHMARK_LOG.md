# Benchmark Log

This file tracks benchmark cases and calibration runs. It is intentionally more detailed than the stable docs because benchmark details can change as prompts, source files, and professor feedback evolve.

## How To Add A Benchmark Case

Use this format:

```md
## YYYY-MM-DD - Case or Run Name

Status: Open | In Progress | Resolved | Archived
Stage:
Source Set:
Prompt Version:
Model:
Expected:
Actual:

Issue:
What disagreed or needs review.

Current Interpretation:
What we currently believe is happening.

Next Action:
What should happen next.
```

## 2026-06-20 - Stage 1 Summary Benchmark

Status: In Progress
Stage: DelegateLaw binary classification
Source Set: Professor-provided summary / major-provisions documents
Prompt Version: Current benchmark-aligned delegation prompt
Model: To be recorded per run
Expected: Match professor's legacy manual labels
Actual: To be recorded per run

Issue:
The benchmark needs a repeatable record of expected labels, source documents, prompt versions, model outputs, and mismatch reasons.

Current Interpretation:
The current work is benchmark alignment, not a final legal-truth evaluation. Summary-based benchmark runs and full-law exploratory runs must be tracked separately.

Next Action:
Create a simple benchmark table or script output that records one row per law: source file, expected label, actual label, prompt version, model, rationale link or text, and resolution status.

## 2026-06-20 - PL 83-577 Negative Delegation Case

Status: Needs Review
Stage: DelegateLaw binary classification
Source Set: Summary / major-provisions document
Prompt Version: Current benchmark-aligned delegation prompt
Model: To be recorded per run
Expected: False / N
Actual: To be recorded per run

Issue:
This case is useful because broad delegation wording can cause the model to classify agency references or procedural changes as delegation.

Current Interpretation:
Treat this as a calibration case, not as a permanent rule in the main project docs. If the model disagrees, the mismatch should be categorized as prompt issue, source issue, benchmark ambiguity, or model limitation.

Next Action:
Run this case through the current summary-based workflow, record the exact output, and move the item to `COMPLETED_WORK.md` once the resolution is understood.

