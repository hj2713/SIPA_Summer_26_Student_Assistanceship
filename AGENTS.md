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
  - Job Queue: Enqueued in PostgreSQL `workflow_jobs` table; drained by [`WorkflowDashboardService`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/services/workflow_dashboard_service.py#L28-L50) (`workflow-worker-*`).
  - Concurrency & Results: Multi-model evaluation runs must merge into `dashboard_documents.coded_values` atomically to avoid race conditions when models finish at different speeds.
- **Database Architecture & Schemas**:
  - Connection pooling: [`backend/app/core/database.py`](backend/app/core/database.py) (~125 lines, pool management only).
  - Schema DDL files: [`backend/app/db/schemas/postgres_schema.sql`](backend/app/db/schemas/postgres_schema.sql) and [`backend/app/db/schemas/sqlite_schema.sql`](backend/app/db/schemas/sqlite_schema.sql).
  - Schema execution & migrations: [`backend/app/core/schema.py`](backend/app/core/schema.py).
- **Testing Security & Isolation**:
  - **Zero Cloud Touch**: Tests are strictly air-gapped from PostgreSQL/Supabase. Attempting to connect to PostgreSQL during tests (`TEST_MODE=1`) raises an immediate `RuntimeError`.
  - **Abstract Factories**: All tests use [`backend/app/tests/factories.py`](backend/app/tests/factories.py) (`create_test_user`, `create_test_workspace`, `create_test_campaign`, `create_test_document`, `mock_llm_reply`) instead of raw SQL queries.
  - Never run broad/unqualified `DELETE FROM` statements in test fixtures.
- **Tech Stack**:
  - Backend: FastAPI (`backend/app`), PostgreSQL / Supabase, Pydantic, Uvicorn
  - Frontend: React + TypeScript + Vite + Tailwind CSS (`frontend/src`)
