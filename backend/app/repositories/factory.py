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
            kwargs={
                "row_factory": dict_row,
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
        conn = pool.getconn()
        conn.autocommit = False
        return PostgresUnitOfWork(conn, on_close_callback=lambda c: pool.putconn(c))
    else:
        # SQLite
        db_path = get_db_path()
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        return SQLiteUnitOfWork(db_path)
