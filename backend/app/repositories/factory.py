import os
import logging
from contextlib import contextmanager
from typing import Generator
from app.core.config import settings
from app.repositories.base import BaseUnitOfWork
from app.repositories.sqlite import SQLiteUnitOfWork
from app.repositories.postgres import PostgresUnitOfWork
from app.core.database import get_db_path, get_postgres_pool, close_postgres_pool

logger = logging.getLogger(__name__)


def get_db_session() -> BaseUnitOfWork:
    """Returns the active Unit of Work according to DB_PROVIDER."""
    if settings.DB_PROVIDER == "postgres":
        pool = get_postgres_pool()
        try:
            # Keep checkout waits short. Callers run in FastAPI's worker pool, but a
            # saturated DB pool should still fail promptly instead of building an
            # unbounded request backlog.
            conn = pool.getconn(timeout=2.0)
        except Exception:
            logger.exception("PostgreSQL pool checkout failed; stats=%s", pool.get_stats())
            raise
        try:
            if os.environ.get("TEST_MODE", "").lower() in ("1", "true", "yes"):
                from app.tests.base import SafeTestConnection
                conn = SafeTestConnection(conn)
            return PostgresUnitOfWork(conn, on_close_callback=lambda c: pool.putconn(c))
        except Exception:
            pool.putconn(conn)
            raise
    else:
        # SQLite
        db_path = get_db_path()
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        return SQLiteUnitOfWork(db_path)
