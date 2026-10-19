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

## 2026-06-22 - Reusable Versioned Workflows Are The Research Instrument

Decision:
Move campaign coding toward reusable, versioned Coding Workflows. Workflows define typed multi-field outputs, LLM stages, deterministic conditions/actions, dependencies, source-context policy, validation, and dashboard outputs. Campaigns select an immutable published workflow version and apply it to documents.

Reason:
The professor's process is a staged and reproducible coding methodology. Re-entering prompts and columns per campaign duplicates the method, obscures intermediate results, prevents safe deterministic shortcuts, and makes comparisons across document sets harder to reproduce.

Implication:
Build a workflow library and builder as a separate product surface. Use a validated DAG as the executable model, keep canvas layout separate, prohibit arbitrary pasted code, and preserve node-level inputs, outputs, provenance, costs, and histories. Existing campaigns will be migrated through generated legacy workflow drafts rather than destructively rewritten. See `Project-Tracking/RULE_ENGINE_IMPLEMENTATION_PLAN.md`.
