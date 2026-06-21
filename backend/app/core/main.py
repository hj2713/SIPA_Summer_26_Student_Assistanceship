"""FastAPI application entry point.

Registers CORS, all routers, and logs startup config warnings.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routes import auth, chat, health, threads, documents, dashboards, usage

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
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM documents WHERE status IN ('pending', 'processing');")
            stale_docs = cursor.fetchall()
            if stale_docs:
                doc_ids = [d["id"] for d in stale_docs]
                logger.info("Found %d stale pending/processing documents. Marking as failed due to server restart.", len(doc_ids))
                conn.execute(
                    "UPDATE documents SET status = 'failed', error_message = ? WHERE status IN ('pending', 'processing');",
                    ("Ingestion was interrupted due to server restart or reload.",)
                )
            
            # Clean up stale dashboard document coding statuses
            cursor.execute("SELECT dashboard_id, document_id FROM dashboard_documents WHERE status IN ('pending', 'processing');")
            stale_dash_docs = cursor.fetchall()
            if stale_dash_docs:
                logger.info("Found %d stale pending/processing dashboard document coding jobs. Marking as failed.", len(stale_dash_docs))
                conn.execute(
                    """
                    UPDATE dashboard_documents 
                    SET status = 'failed', error_message = ?, error_type = 'API_FAILURE' 
                    WHERE status IN ('pending', 'processing');
                    """,
                    ("Coding was interrupted due to server restart or reload.",)
                )
            
            conn.commit()
    except Exception as e:
        logger.error("Failed to clean up stale document statuses on startup: %s", e)
        
    yield


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

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(threads.router)
    app.include_router(chat.router)
    app.include_router(documents.router)
    app.include_router(dashboards.router)
    app.include_router(usage.router)

    return app


app = create_app()
