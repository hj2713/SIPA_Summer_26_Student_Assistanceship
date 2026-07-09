# Memory — SIPA_SA

> Generated: 2026-07-09 15:15:14  
> Total memories: **7**  
> Breakdown: fact: 1, decision: 1, learning: 2, artifact: 3

---

## Instructions

*Standing rules, constraints, and guidelines to always follow.*

*No memories of this type.*

---

## Facts

*Verified information, project status, and established truths.*

### This is a test memory.

This is a test memory.

*Confidence: 0.8 | Status: active | Created: 2026-07-03T00:59:52*

---

## Decisions

*Architectural choices, approach selections, and their rationale.*

### Resolved all verify placeholders in the paper main...

Resolved all verify placeholders in the paper main.tex, correcting years to 1950-2020, defining the 15-law development set (13 positive summaries + 2 negative summaries), and specifying the 6 models from campaign 3a52325d-68c4-4067-9ebb-36b999bc91d8.

*Confidence: 1.0 | Status: active | Created: 2026-07-09T19:15:09*

---

## Goals

*Objectives, targets, and milestones to track progress.*

*No memories of this type.*

---

## Commitments

*Promises, obligations, and TODOs that need follow-through.*

*No memories of this type.*

---

## Preferences

*User and entity preferences for personalization.*

*No memories of this type.*

---

## Relationships

*Entity connections, team context, and collaboration patterns.*

*No memories of this type.*

---

## Context

*Session summaries, status updates, and conversation state.*

*No memories of this type.*

---

## Events

*Important conversations, milestones, and temporal occurrences.*

*No memories of this type.*

---

## Learnings

*Knowledge acquired from experience, corrections, and insights.*

### Resolved a LaTeX compilation error caused by illeg...

Resolved a LaTeX compilation error caused by illegal use of \ double backslashes for paragraph spacing, replacing them with standard paragraph separation and \medskip.

*Confidence: 1.0 | Status: active | Created: 2026-07-09T19:15:11*

### Supabase egress investigation found the model-eval...

Supabase egress investigation found the model-evaluation page was polling /api/dashboards/{id}/documents every 4 seconds while jobs ran, repeatedly transferring full dashboard_documents coded_values and workflow trace/context JSON from Supabase Postgres; fixed by polling /documents/status-summary and throttling full document refreshes to completion/count changes or 20-second intervals.

*Confidence: 0.95 | Status: active | Created: 2026-07-06T22:31:42 | Tags: `supabase-egress`, `model-evaluation`, `polling`*

---

## Observations

*Patterns noticed, behavioral notes, and recurring themes.*

*No memories of this type.*

---

## Artifacts

*Tool outputs, files, reports, and external references.*

### Integrated screenshots Benchmark_Results.png, Dash...

Integrated screenshots Benchmark_Results.png, Dashboard.png, and workflow_trace_for_every_file.png into main.tex and compiled successfully.

*Confidence: 1.0 | Status: active | Created: 2026-07-09T19:15:10*

### Added Table 4 to main.tex representing cross-model...

Added Table 4 to main.tex representing cross-model evaluation performance across CASCADE, M9, and B3 strategies on the 15-law development set.

*Confidence: 1.0 | Status: active | Created: 2026-07-09T19:15:09*

### Created and integrated workflow_dag.tex, a TikZ vi...

Created and integrated workflow_dag.tex, a TikZ visual representation of the modular DAG architecture (pre-processing screen, feature extraction, parallel CASCADE/M9/B3 branches, and validation suite).

*Confidence: 1.0 | Status: active | Created: 2026-07-09T19:15:10*

---

## Errors

*Failure records, bugs, and lessons learned from mistakes.*

*No memories of this type.*

---

*End of memory export.*
