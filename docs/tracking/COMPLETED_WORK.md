# Completed Work

This file records resolved items and completed milestones. Keep entries concise, with enough context for a future agent to understand what changed.

## 2026-11-06 - Verification & Concurrency Analysis of Cloud Evaluation Run (`4568634e-6d67-4ce7-98a3-61dc0c619707`)

Status: Completed

Summary:
Investigated a cloud evaluation launched from the frontend (`https://law-delegation.vercel.app/evaluation/4568634e-6d67-4ce7-98a3-61dc0c619707`) on document `15 Laws Summary/PL107-123_2001_Investor_CapitalMarketsFeeReliefAct.txt` with models `openai/gpt-5.5` and `deepseek/deepseek-v4-flash`. Verified live via Supabase PostgreSQL queries that the evaluation worker was healthy and actively draining a 350+ item FIFO queue in `workflow_jobs`. Verified both models completed inference without errors (`deepseek` generated 132 fields in ~18s, `gpt-5.5` generated 133 fields in ~3m). Diagnosed why the UI remained stuck in "processing": concurrent model execution tasks suffered a write-race condition where GPT-5.5's task serialized its initial in-memory dictionary snapshot back to `dashboard_documents.coded_values`, clobbering DeepSeek's earlier completed fields.

Follow-Up:
Update [`WorkflowDashboardService`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/services/workflow_dashboard_service.py#L28-L50) to atomically re-fetch and merge `coded_values` before writing. Documented immediate remediation: re-run `deepseek/deepseek-v4-flash` via the frontend retry button.

## 2026-06-20 - Project Docs Reorganized

Status: Completed

Summary:
Rewrote the stable project docs so they describe vision, product surface, architecture, and operating principles without embedding temporary benchmark incident details.

Files:
1. `README.md`
2. `Setup-Files/AIM_OF_PROJECT.md`
3. `Setup-Files/FEATURES.md`

Follow-Up:
Use `Project-Tracking/` for active and resolved work going forward.

## 2026-06-22 - Standalone Coding Workflow Foundation

Status: Completed

Summary:
Implemented a new workspace-scoped Workflow Library, visual DAG builder, and isolated draft test executor without changing existing campaign creation, document coding, dashboard schemas, or results. The feature includes reusable templates, typed multi-output LLM nodes, safe conditions, deterministic assignments, upstream dependency selection, graph validation, execution traces, optimistic draft saving, and immutable published versions across SQLite and PostgreSQL.

Follow-Up:
Campaign adoption and execution remain a separate future phase.

## 2026-06-23 - Project Law Delegation + Discretion Rank Workflow Template

Status: Completed

Summary:
Added the first project-specific Coding Workflow template. It emits only `delegate_law` and `discretion_rank` as final outputs while keeping actors, authorities, evidence, constraints, scope notes, and rationale nested inside internal audit/detail objects. The workflow can test pasted text or temporary uploaded law files, uses a deterministic rank-zero branch when no delegation is found, and leaves campaign/dashboard execution unchanged.

Follow-Up:
Visually review the template in `/workflows`, then decide when campaigns should adopt published workflow versions.

## 2026-06-23 - DB-Managed Workflow Templates

Status: Completed

Summary:
Moved workflow starters toward an n8n-style model where reusable templates are DB-managed JSON records instead of normal code-edit targets. Added `coding_workflow_templates`, DB-backed template APIs, import/export/duplicate/delete support in the Workflow Library, and workflow creation from `template_id`. Blank Workflow and Law Delegation + Discretion Rank are seeded idempotently per workspace, and existing workflow drafts/published versions remain unchanged.

Follow-Up:
Add a dedicated template editor screen if researchers need to edit templates directly rather than editing copied workflow drafts.

## 2026-06-24 - Professor Benchmark Calibration Panel

Status: Completed

Summary:
Added a first benchmark-calibration layer for workflow/campaign result dashboards. The backend now compares dashboard rows against the professor-provided CQ-summary benchmark CSV by filename and reports DelegateLaw accuracy, exact Discretion Rank accuracy, within-1 rank accuracy, mean absolute error, a 0-4 confusion matrix, and mismatch rows with likely failure reasons. Workflow dashboards now have a “Professor Benchmark” button that shows metrics, source-set warnings, and a mismatch table linked to each row’s workflow trace.

Follow-Up:
Use summary/major-provisions inputs for benchmark runs. Full statutory text runs should be labeled exploratory and should not be treated as direct failures against this benchmark.
