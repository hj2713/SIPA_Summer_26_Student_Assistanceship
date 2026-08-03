# Memory — SIPA_SA

> Generated: 2026-07-21 20:40:35  
> Total memories: **35**  
> Breakdown: instruction: 3, fact: 1, decision: 22, preference: 1, learning: 2, artifact: 4, error: 2

---

## Instructions

*Standing rules, constraints, and guidelines to always follow.*

### User updated paper/main.tex: removed 'and the ordi...

User updated paper/main.tex: removed 'and the ordinal confusion matrix' from Section VII.B Metrics description. NEVER overwrite or revert any user edits in paper/main.tex.

*Confidence: 1.0 | Status: active | Created: 2026-07-22T00:40:33*

### In Codex for /Users/himanshujhawar/Desktop/Develop...

In Codex for /Users/himanshujhawar/Desktop/Developing/Law Delegation, MEMANTO on-prem at http://localhost:8080 is reachable outside the sandbox but not from sandboxed commands. host.docker.internal does not resolve in this environment, and the host LAN IP was also unreachable from inside the sandbox. Operational workaround: run memanto commands with escalated host access when persistence or recall is needed.

*Confidence: 0.95 | Status: active | Created: 2026-07-09T19:40:52 | Tags: `memanto`, `codex-sandbox`, `host-network`, `law-delegation`*

### User updated paper/main.tex (reverted Figure 1 to ...

User updated paper/main.tex (reverted Figure 1 to inline TikZ and adjusted tabularx column width in Table 2). Do not undo or overwrite these user edits in main.tex.

*Confidence: 1.0 | Status: active | Created: 2026-07-21T20:56:23*

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

### Deleted all commented-out figures, captions, and t...

Deleted all commented-out figures, captions, and title metadata comments in main.tex. Adjusted Appendix text to omit references to commented-out workflow_dag figure, leaving the LaTeX source entirely clean and production-ready.

*Confidence: 1.0 | Status: active | Created: 2026-07-17T01:04:19*

### Anonymized author block and dashboard URL in main....

Anonymized author block and dashboard URL in main.tex for double-blind review, verified 3rd-person self-citations, added explicit retry parameter statement to Section VI.D, and confirmed clean Tectonic build of main.pdf.

*Confidence: 1.0 | Status: active | Created: 2026-07-20T06:14:15*

### Populated the empty Limitations subsection with a ...

Populated the empty Limitations subsection with a comprehensive, professional explanation of formatting dependencies, domain scope limits, and model version variances. Checked the rest of the text and verified that the only remaining TBD placeholders are within the data results tables.

*Confidence: 1.0 | Status: active | Created: 2026-07-17T02:03:52*

### Removed Table 3 (Binary delegation results) entire...

Removed Table 3 (Binary delegation results) entirely, replacing it with a concise narrative paragraph in the text. This eliminated all version numbers (v7, v8) from the results reporting and saved substantial vertical space.

*Confidence: 1.0 | Status: active | Created: 2026-07-17T00:56:31*

### Removed all DELETE FROM statements from all test f...

Removed all DELETE FROM statements from all test files and conftest.py fixtures, ensuring zero deletion queries can be executed against any database.

*Confidence: 1.0 | Status: active | Created: 2026-07-20T07:26:55*

### Condensed Abstract and Introduction to save page l...

Condensed Abstract and Introduction to save page length. Removed redundant HITL workflow diagram (Figure 3) and simplified the human validation text. Fixed experimental protocol word spacing by adding raggedright. Confirmed anonymity for IEEE ICTAI 2026 double-blind guidelines.

*Confidence: 1.0 | Status: active | Created: 2026-07-17T00:44:51*

### Unified sample size counts in the entire paper to ...

Unified sample size counts in the entire paper to N=169, removing the audit table and simplifying the corpus description to eliminate reader confusion. Condensed Section 2 and consolidated Section 3 to make the text direct and reduce page length. Re-commented out appendix figures workflow_dag and Workflow.png per user configuration. Fixed empty TikZ boxes in Figure 2 by removing overlays.

*Confidence: 1.0 | Status: active | Created: 2026-07-17T00:36:58*

### Removed redundant Table 1 (tab:ordinal) from Secti...

Removed redundant Table 1 (tab:ordinal) from Section 2.3 and adjusted the text to reference the conceptual Figure 1 instead. Restored Table 1 (alg:workflow) in Section 4.2 to show the algorithmic execution steps of the system, keeping all tables formatted and named cleanly.

*Confidence: 1.0 | Status: active | Created: 2026-07-17T01:45:41*

### Installed the academic-research-skills package (v3...

Installed the academic-research-skills package (v3.16.0) as workspace-local skills (deep-research, academic-paper, academic-paper-reviewer, academic-pipeline) under .agents/skills/ and configured routing guidelines in GEMINI.md

*Confidence: 1.0 | Status: active | Created: 2026-07-15T14:05:34*

### Added unit tests in test_workflow_dashboard_servic...

Added unit tests in test_workflow_dashboard_service.py covering raw file storage lookup, chunk reassembly fallback, document creation storage upload, and in-memory source_text RAM reuse.

*Confidence: 1.0 | Status: active | Created: 2026-07-20T07:18:21*

### Commented out Figure 4 (AI Benchmark screenshot) i...

Commented out Figure 4 (AI Benchmark screenshot) in the appendix to reduce layout size. Replaced the cylinder shape with a clean box style for the database node in Figure 2 to prevent vertical stretching and resolve layout issues.

*Confidence: 1.0 | Status: active | Created: 2026-07-17T00:49:55*

### Added One-Shot baseline to Table 4, corrected Kimi...

Added One-Shot baseline to Table 4, corrected Kimi model string to Kimi K2.5, added sample count table footnote, and added explicit prose framing ordinal kappa and error distributions in main.tex.

*Confidence: 1.0 | Status: active | Created: 2026-07-20T06:43:35*

### Successfully converted main.tex to the official IE...

Successfully converted main.tex to the official IEEEtran conference format (conference class, IEEE author block, keywords, and IEEEtran bibliography). Resolved pdflatex em-dash and math packages compile issues. Confirmed Tectonic compilation to main.pdf (99.6 KiB).

*Confidence: 1.0 | Status: active | Created: 2026-07-17T01:56:04*

### Updated main.tex with all of Professor O'Halloran'...

Updated main.tex with all of Professor O'Halloran's handoff revisions: primary replicability positioning, 4-bullet contribution list, formal problem formulation (strategy predictions vs theory-implied rank), updated Table 1 (tab:algorithm), inspectable/testable language, and revised Future Work/Conclusion.

*Confidence: 1.0 | Status: active | Created: 2026-07-20T05:50:49*

### Updated Gemini model identifier in main.tex and pe...

Updated Gemini model identifier in main.tex and pending_feedback.tex to Gemini 3.5 (gemini-3.5-flash) everywhere; recompiled main.pdf successfully.

*Confidence: 1.0 | Status: active | Created: 2026-07-20T06:18:13*

### Updated _document_text in workflow_dashboard_servi...

Updated _document_text in workflow_dashboard_service.py to directly fetch full raw text from storage using document_service.download_file_from_storage when file_path exists, fixed get_by_id repository lookup bug, and retained chunk re-assembly as a fallback for legacy records.

*Confidence: 1.0 | Status: active | Created: 2026-07-20T07:10:50*

### Unified evaluation corpus sample size to N=169 acr...

Unified evaluation corpus sample size to N=169 across all text and tables (Table 3 & Table 4) in main.tex; recompiled main.pdf cleanly.

*Confidence: 1.0 | Status: active | Created: 2026-07-20T06:56:19*

### Removed redundant Table 1 (Algorithmic Execution) ...

Removed redundant Table 1 (Algorithmic Execution) to rely on workflow primitive list and Figure 1. Restored a simplified Table 3 comparison for binary delegation (no version numbers). Added live vercel website link footnote in the Introduction. Removed Appendix A entirely to save page length.

*Confidence: 1.0 | Status: active | Created: 2026-07-17T01:40:51*

### Completed comprehensive peer review of main.tex fo...

Completed comprehensive peer review of main.tex for IEEE ICTAI 2026 conference fit; generated review report package; recommended version renaming and sample size framing changes

*Confidence: 1.0 | Status: active | Created: 2026-07-15T14:13:56*

### Reframed paper for IEEE ICTAI 2026 as a technical ...

Reframed paper for IEEE ICTAI 2026 as a technical tools paper, centering contribution on visual workflow architecture rather than human-in-the-loop review. Created reproducibility trace diagram, Problem Formulation equations, and pseudocode Algorithm Box.

*Confidence: 1.0 | Status: active | Created: 2026-07-17T00:16:40*

### Completed workflow architecture enhancements: 1) S...

Completed workflow architecture enhancements: 1) Save raw text to StorageService on document creation for Option A, 2) Add source_text parameter to _execute_document for Option B RAM reuse, 3) Batch merged update_workflow_result calls for Option C DB egress optimization.

*Confidence: 1.0 | Status: active | Created: 2026-07-20T07:16:12*

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

### User preferred to hide all N=15 exploratory discre...

User preferred to hide all N=15 exploratory discretion rank tables and numbers in the paper. All discretion tables (Table 4, Table 5, system metrics, stability agreement) are replaced with red highlighted placeholders for N >= 150.

*Confidence: 1.0 | Status: active | Created: 2026-07-17T00:16:42*

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

### Created paper/run_large_scale_eval.py, an automate...

Created paper/run_large_scale_eval.py, an automated evaluation runner that runs the detailed workflow in parallel on the full N >= 150 summaries database using local venv and .env credentials, outputting finished LaTeX tables for copy-pasting.

*Confidence: 1.0 | Status: active | Created: 2026-07-17T00:16:44*

---

## Errors

*Failure records, bugs, and lessons learned from mistakes.*

### Root cause of 'PostgresDocumentRepository' object ...

Root cause of 'PostgresDocumentRepository' object has no attribute 'get' error in workflow_dashboard_service.py line 346: session.documents.get(document_id) was called instead of session.documents.get_by_id(document_id) during document text retrieval fallback when chunks are missing.

*Confidence: 1.0 | Status: active | Created: 2026-07-20T06:58:51*

### Fixed conftest.py cleanup fixture to only delete Q...

Fixed conftest.py cleanup fixture to only delete QA workspace and strictly protect PRODUCTION workspace, preventing test suites from clearing PRODUCTION dashboards/workflows in Supabase.

*Confidence: 1.0 | Status: active | Created: 2026-07-20T07:23:24*

---

*End of memory export.*
