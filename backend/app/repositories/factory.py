import os
import logging
from contextlib import contextmanager
from typing import Generator
from app.core.config import settings
from app.repositories.base import BaseUnitOfWork
from app.repositories.sqlite import SQLiteUnitOfWork
from app.repositories.postgres import PostgresUnitOfWork
from app.core.database import get_db_path

logger = logging.getLogger(__name__)

# Global PostgreSQL connection pool
_pg_pool = None

def get_postgres_pool():
    """Lazily initialize the connection pool for PostgreSQL."""
    global _pg_pool
    if _pg_pool is None:
        if not settings.DATABASE_URL:
            raise ValueError("DATABASE_URL is not set but DB_PROVIDER is 'postgres'")
        
        from psycopg_pool import ConnectionPool
        from psycopg.rows import dict_row
        
        logger.info("Initializing PostgreSQL Connection Pool with DATABASE_URL...")
        _pg_pool = ConnectionPool(
            conninfo=settings.DATABASE_URL,
            min_size=1,
            max_size=20,
            open=True,
            # Recycle connections regularly and validate them before checkout so
            # Render never keeps a half-dead Supavisor connection indefinitely.
            max_lifetime=300.0,
            max_idle=60.0,
            check=ConnectionPool.check_connection,
            kwargs={
                "row_factory": dict_row,
                # Repository writes are individual SQL statements. Autocommit
                # prevents read requests from pinning a Supabase transaction-pool
                # connection if request cleanup is delayed or interrupted.
                "autocommit": True,
                "application_name": "law-delegation-api",
                # prepare_threshold=None disables auto-prepared statements entirely.
                # psycopg3: 0 = prepare immediately (WRONG), None = never prepare (CORRECT)
                # Required for Supabase pgBouncer Transaction pooler (port 6543).
                "prepare_threshold": None,
            }
        )
    return _pg_pool

def close_postgres_pool():
    """Shutdown the PostgreSQL connection pool."""
    global _pg_pool
    if _pg_pool is not None:
        logger.info("Closing PostgreSQL Connection Pool...")
        _pg_pool.close()
        _pg_pool = None

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
