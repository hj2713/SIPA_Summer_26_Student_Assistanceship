# Law Delegation

Law Delegation is a local-first research platform for structured legislative coding.

The project helps policy researchers upload legislative documents, define coding campaigns, run LLM-assisted classification, inspect reasoning, revise outputs, and export structured datasets for academic analysis.

## What We Are Building

The main product is a campaign coding dashboard, not a general legal chatbot.

Researchers should be able to:

1. Create a research campaign from a codebook or prompt.
2. Upload or link law summaries and legal documents.
3. Generate or manually define coding columns.
4. Run structured LLM coding.
5. Inspect values, rationales, and coding history.
6. Override or re-evaluate questionable outputs.
7. Export the final dataset for downstream analysis.

Chat and retrieval features exist to support exploration, but the campaign coding workflow is the core product.

## Project Stage

The project is currently in a calibration stage.

The near-term goal is to make one important delegation field reliable before expanding into the full research codebook. This means the team is focusing on benchmark alignment, prompt clarity, source-document discipline, and review workflows.

Future work should expand from the binary delegation stage into richer discretion and constraint coding once the first-stage benchmark is trustworthy.

## How To Think About This Repo

Future agents should treat this repository like a product under active research calibration.

Stable project intent belongs in:

1. `Setup-Files/AIM_OF_PROJECT.md`
2. `Setup-Files/FEATURES.md`
3. `README.md`

Active work, unresolved issues, benchmark incidents, and completed fixes belong in:

1. `Project-Tracking/ACTIVE_WORK.md`
2. `Project-Tracking/DECISIONS.md`
3. `Project-Tracking/COMPLETED_WORK.md`

Do not turn stable docs into a running diary. If a detail may become stale after a prompt change, data fix, or code fix, track it in `Project-Tracking/`.

## Product Surface

### Research Campaigns

Campaigns store the research prompt, schema, selected model, linked documents, and coding results.

### Coding Dashboard

The dashboard presents documents as rows and research variables as columns. It supports inspection, reasoning review, manual overrides, re-evaluation, and export.

### Document Ingestion

The ingestion pipeline parses uploaded files, stores originals locally, chunks text for retrieval, and makes documents available to campaigns.

### Chat and Retrieval

The chat system supports exploratory questions over local documents and campaign context. It is useful, but secondary to the coding workflow.

## Architecture

The app is local-first.

### Frontend

1. React
2. TypeScript
3. Vite
4. Tailwind

### Backend

1. FastAPI
2. SQLite
3. Local filesystem storage
4. Local authentication

### AI and Retrieval

1. Gemini, OpenAI, or OpenRouter for LLM calls
2. Docling for document parsing
3. Local chunk-based retrieval
4. Optional tracing for debugging

## Setup

### Prerequisites

1. Python 3.11+
2. Node.js 20+
3. At least one configured LLM provider key

### Install

```bash
./scripts/setup.sh
```

### Start

```bash
./scripts/start.sh
```

The app runs at:

1. Frontend: `http://localhost:5173`
2. Backend: `http://127.0.0.1:8000`

### Stop

```bash
./scripts/stop.sh
```

## Environment

Backend environment lives in `backend/.env`.

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_MODEL=
OPENAI_API_KEY=
OPENAI_MODEL=
OPEN_ROUTER_API_KEY=
OPEN_ROUTER_MODEL_NAME=
LANGSMITH_TRACING=false
LANGSMITH_API_KEY=
```

Frontend environment lives in `frontend/.env.local`.

```env
VITE_API_BASE_URL=http://localhost:8000
```

## Development Commands

Backend:

```bash
cd backend
venv/bin/python -m pytest app/tests/ -v
venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend:

```bash
cd frontend
npm run dev
npm run build
```

## Engineering Priorities

1. Keep campaign coding logic clean and testable.
2. Keep experimental prompt research separate from production services.
3. Improve benchmark and run tracking.
4. Preserve local-first behavior unless a cloud dependency is deliberately justified.
5. Maintain traceability for coding values, rationales, prompt versions, models, and overrides.

## Short Handoff

This repo is building a serious research coding platform for legislative delegation analysis.

The immediate mission is to make the first-stage delegation coding workflow reliable, inspectable, and repeatable. Once that is stable, the project should expand toward richer discretion and constraint coding.

