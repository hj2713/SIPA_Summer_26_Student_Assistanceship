# Memory — SIPA_SA

> Generated: 2026-06-24 15:44:54  
> Total memories: **15**  
> Breakdown: decision: 15

---

## Instructions

*Standing rules, constraints, and guidelines to always follow.*

*No memories of this type.*

---

## Facts

*Verified information, project status, and established truths.*

*No memories of this type.*

---

## Decisions

*Architectural choices, approach selections, and their rationale.*

### Added upload and link click-locking states and but...

Added upload and link click-locking states and button spinners to prevent duplicate submits in campaign dashboard

*Confidence: 1.0 | Status: active | Created: 2026-06-24T18:36:44*

### Implemented a 900ms intentional hover delay and sc...

Implemented a 900ms intentional hover delay and scroll-hiding logic for spreadsheet cell AI reasoning tooltips to prevent tooltips from flickering or opening during rapid scroll/mouse movement.

*Confidence: 1.0 | Status: active | Created: 2026-06-24T19:26:09*

### Optimized campaign document lists page loading spe...

Optimized campaign document lists page loading speed by omitting workflow_trace and workflow_context columns, loading them lazily from a new backend trace endpoint instead

*Confidence: 1.0 | Status: active | Created: 2026-06-24T05:24:12*

### Restructured AI analysis configure node into a 3-s...

Restructured AI analysis configure node into a 3-step inputs-instructions-outputs flow and added validation rules listing display in workflow side panel

*Confidence: 1.0 | Status: active | Created: 2026-06-24T05:54:44*

### Optimized campaign dashboard polling frequency to ...

Optimized campaign dashboard polling frequency to 5 seconds and progressive row loading inside doUploadFiles to update document processing state in real time

*Confidence: 1.0 | Status: active | Created: 2026-06-24T18:36:44*

### Capped Workflow Trace modal height to min(height, ...

Capped Workflow Trace modal height to min(height, 90vh) to prevent viewport bottom border clipping and ensure internal scrollbars work properly

*Confidence: 1.0 | Status: active | Created: 2026-06-24T18:24:44*

### Implemented workflow reasoning mapping to campaign...

Implemented workflow reasoning mapping to campaign columns and initialized version 1 history arrays when a workflow completes

*Confidence: 1.0 | Status: active | Created: 2026-06-24T05:24:06*

### Refactored run_uploaded_files and run_existing_doc...

Refactored run_uploaded_files and run_existing_documents in workflow_dashboard_service.py to run asynchronously, scheduling workflow document execution on the background coding thread loop

*Confidence: 1.0 | Status: active | Created: 2026-06-24T18:47:34*

### This allows frontend link/upload modals to close i...

This allows frontend link/upload modals to close immediately (within ~100ms) and display linked files as pending/processing on the campaign dashboard in real-time

*Confidence: 1.0 | Status: active | Created: 2026-06-24T18:47:35*

### Removed the 'relative' CSS position class override...

Removed the 'relative' CSS position class override from the Workflow Trace modal DialogContent, allowing it to inherit the default 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' center-alignment from the UI dialog system.

*Confidence: 1.0 | Status: active | Created: 2026-06-24T19:44:51*

### Redesigned Compare with Benchmark spreadsheet mism...

Redesigned Compare with Benchmark spreadsheet mismatch rendering to display both LLM and CSV values inline stacked together, avoiding tooltip hover requirement

*Confidence: 1.0 | Status: active | Created: 2026-06-24T18:24:44*

### Disabled and locked the 'Retry Failed' button on c...

Disabled and locked the 'Retry Failed' button on click and while failed documents are being enqueued, pending, or processing on the campaign dashboard to prevent duplicate submits.

*Confidence: 1.0 | Status: active | Created: 2026-06-24T18:57:43*

### Deleted the 'TEST' workspace from the production d...

Deleted the 'TEST' workspace from the production database and confirmed that documents in the 'QA' workspace are already owned by test@gmail.com, requiring no further migration.

*Confidence: 1.0 | Status: active | Created: 2026-06-24T19:20:51*

### Implemented multi-select and inline document unlin...

Implemented multi-select and inline document unlinking from a campaign dashboard without deleting the original files or chunks from storage/DB

*Confidence: 1.0 | Status: active | Created: 2026-06-24T05:43:28*

### Redesigned the benchmark accuracy display to show ...

Redesigned the benchmark accuracy display to show column-wise accuracy statistics inside the Benchmark Accuracy Banner and each spreadsheet column header when benchmark mode is active.

*Confidence: 1.0 | Status: active | Created: 2026-06-24T19:22:52*

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

*No memories of this type.*

---

## Observations

*Patterns noticed, behavioral notes, and recurring themes.*

*No memories of this type.*

---

## Artifacts

*Tool outputs, files, reports, and external references.*

*No memories of this type.*

---

## Errors

*Failure records, bugs, and lessons learned from mistakes.*

*No memories of this type.*

---

*End of memory export.*
