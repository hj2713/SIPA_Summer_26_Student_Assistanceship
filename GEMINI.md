# Law Delegation Platform

Platform for structured legislative coding and LLM-assisted evaluation campaigns.

## Key Rules & Conventions

- **Python**: Always use `backend/venv/bin/python` or `backend/venv/bin/pytest`. Never install packages globally.
- **Environment & Secrets**: Never read or inspect `.env` files. Never hardcode credentials. Always reference `.env.example`.
- **Server Lifecycle**:
  - Start services: `./scripts/start.sh` (logs stream to `logs/backend.log` and `logs/frontend.log`)
  - Stop services: `./scripts/stop.sh`
  - Setup dependencies: `./scripts/setup.sh`
- **Active Workflows & Evaluation**:
  - Benchmark runner: `scripts/run_benchmark_evaluations.py`
  - Status reporter: `scripts/report_benchmark_status.py`
- **Tech Stack**:
  - Backend: FastAPI (`backend/app`), PostgreSQL / Supabase, Pydantic, Uvicorn
  - Frontend: React + TypeScript + Vite + Tailwind CSS (`frontend/src`)
