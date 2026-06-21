# Product Features

This document describes the product surface of Law Delegation. It should remain focused on capabilities and product behavior, not temporary research incidents.

For active bugs, benchmark notes, and resolved calibration work, use `Project-Tracking/`.

---

## Research Campaigns

Campaigns are the main organizing unit of the product.

Current and intended campaign capabilities include:

1. Create a campaign with a name, description, model, and codebook prompt.
2. Generate structured coding columns from a research prompt.
3. Allow manual column creation when the researcher already knows the schema.
4. Regenerate schema when the codebook changes.
5. Link selected workspace documents into a campaign.
6. Keep campaign configuration separate from experimental prompt-testing scripts.

## Coding Dashboard

The dashboard is the primary working surface for researchers.

Current and intended dashboard capabilities include:

1. Show linked documents as rows and coded variables as columns.
2. Display coding status for each document.
3. Show model-generated values and rationales.
4. Let users inspect individual cells.
5. Let users manually override values.
6. Preserve value history across AI runs, re-evaluations, and manual edits.
7. Re-run individual cells, columns, or rows with critique.
8. Support column resizing and ordering.
9. Export coded results for external analysis.

## Document Ingestion

The ingestion system prepares source material for coding and retrieval.

Current and intended ingestion capabilities include:

1. Upload text, PDF, DOCX, HTML, Markdown, and related document formats.
2. Parse documents into usable text.
3. Store original files locally.
4. Store parsed chunks in SQLite for retrieval.
5. Detect duplicate uploads using hashes.
6. Retry failed ingestion jobs.
7. Keep workspace document libraries separate from campaign-specific coding decisions.

## Chat and Retrieval

Chat is a supporting feature, not the core product.

Current and intended chat capabilities include:

1. Ask questions over uploaded documents.
2. Use campaign context when relevant.
3. Stream assistant responses.
4. Maintain persistent threads.
5. Retrieve local document chunks.
6. Support text-to-SQL style questions over local structured data where appropriate.

## Review and Calibration

Research coding requires human review. The product should support calibration rather than hiding uncertainty.

Important capabilities include:

1. Store model rationales with outputs.
2. Track prompt and model versions used for coding.
3. Compare outputs against benchmark labels when available.
4. Separate benchmark-alignment runs from exploratory full-text runs.
5. Record unresolved disagreements in project tracking instead of burying them in permanent docs.
6. Convert researcher feedback into clearer codebook rules over time.

## Local-First Platform

The platform is designed to run locally.

Current platform capabilities include:

1. SQLite-backed local data storage.
2. Local filesystem document storage.
3. Local authentication and workspace scoping.
4. Configurable LLM providers.
5. Optional tracing for debugging and evaluation.
6. Startup and setup scripts for local development.

## Current Limitations

The product is usable but still under active development.

Known product limitations include:

1. Benchmark comparison is still partly manual.
2. Prompt calibration is still an active research workflow.
3. The system needs stronger experiment tracking for prompt versions, document sources, expected labels, and run results.
4. The UI does not yet fully behave like a dedicated benchmark evaluation tool.
5. Some architecture and test coverage still reflect earlier prototype phases.

