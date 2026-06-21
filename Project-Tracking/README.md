# Project Tracking

This directory is the working memory for the project.

Use it for active tasks, unresolved research issues, benchmark incidents, implementation decisions, and completed work. Stable product docs should stay clean and strategic; this directory can change frequently.

## Files

1. `ACTIVE_WORK.md`: open issues, current tasks, questions, and next actions.
2. `DECISIONS.md`: decisions that explain why the project is moving in a certain direction.
3. `COMPLETED_WORK.md`: resolved items and completed milestones.
4. `BENCHMARK_LOG.md`: benchmark cases, expected labels, latest results, and resolution status.
5. `METHODOLOGY_STRATEGY.md`: evolving research and system-design strategy for improving coding accuracy beyond prompt wording.

## Tracking Rule

When an issue is no longer active, move it out of `ACTIVE_WORK.md` and summarize the resolution in `COMPLETED_WORK.md`.

When a choice affects future implementation, record it in `DECISIONS.md`.

When a benchmark mismatch appears, record it in `BENCHMARK_LOG.md` with the source set, expected value, actual value, prompt version, model, and status.

When the team considers a new methodology, architecture, or research direction, record it in `METHODOLOGY_STRATEGY.md` even if the idea is rejected.

Do not leave solved one-off problems in the stable docs.
