# Completed Work

This file records resolved items and completed milestones. Keep entries concise, with enough context for a future agent to understand what changed.

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
