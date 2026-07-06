"""FastAPI application entry point.

Registers CORS, all routers, and logs startup config warnings.
"""
import logging
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routes import auth, chat, health, threads, documents, dashboards, usage, workflows

import sys
import os

# Configure logging dynamically based on environment settings
log_handlers = [logging.StreamHandler(sys.stdout)]

if settings.ENV == "development":
    # In development, also log to a local file for easy offline inspection
    os.makedirs("data", exist_ok=True)
    file_handler = logging.FileHandler("data/app.log", encoding="utf-8")
    file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    log_handlers.append(file_handler)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    handlers=log_handlers,
    force=True
)
logger = logging.getLogger(__name__)


def _normalize_dashboard_coded_values_for_restart(
    coded_values_raw,
    error_message: str,
) -> str:
    """Mark stale per-model dashboard runs as failed after a restart."""
    try:
        coded_values = json.loads(coded_values_raw) if isinstance(coded_values_raw, str) else (coded_values_raw or {})
    except Exception:
        coded_values = {}

    if not isinstance(coded_values, dict):
        return "{}"

    updated = False
    for model_name, model_run in list(coded_values.items()):
        if not isinstance(model_run, dict):
            continue
        if model_run.get("status") not in {"pending", "processing"}:
            continue
        model_run["status"] = "failed"
        model_run["error_message"] = error_message
        model_run["error_type"] = "API_FAILURE"
        coded_values[model_name] = model_run
        updated = True

    if not updated:
        return json.dumps(coded_values)
    return json.dumps(coded_values)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.warn_missing()
    logger.info("Starting Agentic RAG API (env=%s)", settings.ENV)
    
    # Initialize SQLite database schema
    from app.core.database import init_db, get_db_conn
    init_db()
    
    # Clean up stale document statuses from database on startup
    try:
        with get_db_conn() as conn:
            if settings.DB_PROVIDER == "postgres":
                conn.execute("SET lock_timeout = '5s';")
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM documents WHERE status IN ('pending', 'processing');")
            stale_docs = cursor.fetchall()
            if stale_docs:
                doc_ids = [d["id"] for d in stale_docs]
                logger.info("Found %d stale pending/processing documents. Marking as failed due to server restart.", len(doc_ids))
                placeholder = "%s" if settings.DB_PROVIDER == "postgres" else "?"
                conn.execute(
                    f"UPDATE documents SET status = 'failed', error_message = {placeholder} WHERE status IN ('pending', 'processing');",
                    ("Ingestion was interrupted due to server restart or reload.",)
                )

            # Durable workflow jobs survive restarts. Release claimed jobs so the
            # DB-backed worker can pick them up again on this process.
            cursor.execute("SELECT id FROM workflow_jobs WHERE status = 'processing';")
            stale_workflow_jobs = cursor.fetchall()
            if stale_workflow_jobs:
                logger.info("Found %d processing workflow jobs on startup. Requeueing them.", len(stale_workflow_jobs))
                conn.execute(
                    """
                    UPDATE workflow_jobs
                    SET status = 'queued', locked_by = NULL, locked_until = NULL
                    WHERE status = 'processing';
                    """
                )
            
            conn.commit()
    except Exception as e:
        logger.error("Failed to clean up stale document statuses on startup: %s", e)

    try:
        from app.services.workflow_dashboard_service import workflow_dashboard_service
        workflow_dashboard_service.kick_workflow_job_worker()
    except Exception as e:
        logger.error("Failed to start workflow job worker: %s", e)
        
    yield
    
    # Close global connection pool on shutdown
    try:
        from app.core.database import close_postgres_pool
        close_postgres_pool()
    except Exception as e:
        logger.error("Failed to close PostgreSQL pool on shutdown: %s", e)


def create_app() -> FastAPI:
    app = FastAPI(
        title="Agentic RAG API",
        version="1.0.0",
        docs_url="/docs" if settings.ENV == "development" else None,
        redoc_url=None,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Pool exhaustion is a temporary infrastructure failure, not an opaque 500.
    # The short checkout timeout keeps worker threads available for later requests.
    from psycopg_pool import PoolTimeout

    @app.exception_handler(PoolTimeout)
    async def postgres_pool_timeout_handler(request, exc):
        logger.error("PostgreSQL pool exhausted: %s", exc)
        return JSONResponse(
            status_code=503,
            content={"detail": "Database connection pool temporarily exhausted"},
            headers={"Retry-After": "2"},
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request, exc):
        logger.exception("Unhandled request error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error. Check backend logs for the full traceback."},
        )

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(threads.router)
    app.include_router(chat.router)
    app.include_router(documents.router)
    app.include_router(dashboards.router)
    app.include_router(usage.router)
    app.include_router(workflows.router)
    app.include_router(workflows.template_router)

    return app


app = create_app()
