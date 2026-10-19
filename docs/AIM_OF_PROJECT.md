# Aim of Project: Law Delegation

This document defines the long-term purpose of the project. It should stay stable and strategic. Do not use this file as a daily issue log, prompt notebook, or temporary debugging record.

For active work, decisions, and resolved issues, use the files in `Project-Tracking/`.

---

## Vision

Law Delegation is a local-first research platform for turning legislative and policy documents into structured social-science datasets.

The product should help a policy researcher move from unstructured legal text to reviewable, exportable coding decisions. The system is not meant to be a generic chatbot over laws. Its core value is structured coding: fields, labels, rationales, review history, corrections, and exports that can support academic analysis.

## Research Problem

The project supports research on congressional delegation and agency discretion.

Researchers want to understand when Congress delegates authority to administrative actors, how much discretion those actors receive, and what statutory or procedural constraints shape that discretion.

Historically, these values were coded manually by researchers. The project aims to make that workflow faster, more inspectable, and easier to reproduce without hiding uncertainty or researcher judgment.

## Product Goal

The main product is a campaign-based coding dashboard.

A researcher should be able to:

1. Define a research codebook.
2. Upload or link relevant documents.
3. Run structured LLM coding against those documents.
4. Inspect each value and rationale.
5. Override or re-evaluate questionable outputs.
6. Track prompt versions and coding history.
7. Export a clean dataset for downstream analysis.

The chat/RAG experience is useful, but it is secondary. The durable product value is the coding workflow and the dataset it produces.

## Current Strategic Focus

The project should progress in stages.

The current stage is benchmark alignment for a single binary delegation field. The purpose of this stage is to recover and operationalize the professor's manual coding logic before expanding into more complex discretion and constraint variables.

This is a research-calibration problem as much as an engineering problem. A plausible LLM rationale is not automatically correct, and a legacy manual label is not automatically self-explanatory. The system must make disagreements visible so researchers can decide whether the prompt, source text, benchmark, or codebook needs revision.

## Operating Principles

1. Keep benchmark experiments and exploratory experiments clearly separated.
2. Do not mix document sources when comparing against a benchmark.
3. Preserve traceability for every coded value: source text, prompt version, model, value, rationale, and review history.
4. Prefer small, testable calibration steps over broad multi-variable prompting.
5. Keep production coding logic separate from one-off prompt experiments.
6. Treat professor feedback as research input that should be captured, tested, and converted into codebook rules.
7. Keep the product understandable for non-technical policy researchers.

## Intended Workflow

The mature workflow should support:

1. Campaign creation from a research prompt or codebook.
2. Document ingestion and campaign linking.
3. Structured coding for delegation and later discretion variables.
4. Human review, override, and re-evaluation.
5. Benchmark comparison when ground-truth labels exist.
6. Export to CSV or spreadsheet formats.
7. Auditability across prompt versions and model runs.

## Architecture Direction

The project is local-first.

The current architecture should remain centered on:

1. React, TypeScript, Vite, and Tailwind on the frontend.
2. FastAPI on the backend.
3. SQLite for local persistence.
4. Local filesystem storage for uploaded documents.
5. Local authentication and workspace scoping.
6. LLM providers such as Gemini, OpenAI, or OpenRouter for structured generation.
7. Optional tracing and evaluation tooling where it helps debugging.

Cloud services should not be introduced casually. If a future cloud dependency is added, it should solve a real product requirement and be documented as an architectural decision.

## Project Management Rule

Stable project docs should answer:

1. What are we building?
2. Why are we building it?
3. What stage are we in?
4. What are the product principles?
5. What should future agents preserve?

They should not store short-lived facts like a specific failed run, one mismatched file, or one temporary prompt issue.

Use `Project-Tracking/` for that work instead.

