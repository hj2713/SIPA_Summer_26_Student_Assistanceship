# Decisions

This file records project decisions that future agents should preserve unless the user deliberately changes direction.

## 2026-06-20 - Stable Docs Are Not Issue Logs

Decision:
`README.md`, `Setup-Files/AIM_OF_PROJECT.md`, and `Setup-Files/FEATURES.md` should describe product vision, architecture, and capabilities. They should not contain temporary debugging details or one-off benchmark incidents.

Reason:
The project moves quickly. If transient details are placed in stable docs, future agents may treat stale problems as permanent truth.

Implication:
Active issues belong in `Project-Tracking/ACTIVE_WORK.md`; resolved issues belong in `Project-Tracking/COMPLETED_WORK.md`.

## 2026-06-20 - Benchmark Runs Must Be Source-Disciplined

Decision:
Benchmark comparisons must record which source universe was used, such as summaries versus full laws.

Reason:
A model output can differ because the prompt is wrong, the source text differs, the benchmark label is ambiguous, or the model reasoning is too broad. These causes should not be collapsed into one "LLM wrong" bucket.

Implication:
Future benchmark tracking should include source set, prompt version, model, expected label, actual label, mismatch reason, and resolution status.

## 2026-06-20 - Production Coding Should Stay Separate From Experiments

Decision:
Production campaign coding should not depend on ad hoc experiment helpers unless they are intentionally promoted into production code.

Reason:
Prompt experiments need freedom to change quickly, while the app's coding service needs predictable behavior.

Implication:
Experimental helpers should live in clearly marked experiment areas and should not silently affect user-facing campaign runs.

