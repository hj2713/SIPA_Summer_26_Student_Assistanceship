"""Database connection pooling, session management, and lifecycle.

All raw schema DDL statements and migration logic are modularized into
`app.db.schemas` and `app.core.schema`.
"""
import os
import sqlite3
import logging
from contextlib import contextmanager
from app.core.config import settings
from app.core.schema import (
    init_postgres_db as schema_init_postgres,
    init_sqlite_db as schema_init_sqlite,
    _clean_bloated_coded_values as schema_clean_bloated,
    hash_password,
    verify_password,
)

logger = logging.getLogger(__name__)


def get_db_path() -> str:
    """Return SQLite database path depending on environment."""
    if os.environ.get("TEST_MODE", "").lower() in ("1", "true", "yes"):
        return "data/test_local_rag.db"
    return "data/local_rag.db"


_pg_pool = None


def get_postgres_pool():
    """Lazily initialize the connection pool for PostgreSQL."""
    global _pg_pool
    if os.environ.get("TEST_MODE", "").lower() in ("1", "true", "yes"):
        raise RuntimeError(
            "CRITICAL SECURITY BLOCK: Unit tests are strictly forbidden from connecting to PostgreSQL / Supabase!"
        )

    if _pg_pool is None:
        if not settings.DATABASE_URL:
            raise ValueError("DATABASE_URL is not set but DB_PROVIDER is 'postgres'")

        from psycopg_pool import ConnectionPool
        from psycopg.rows import dict_row

        logger.info("Initializing PostgreSQL Connection Pool in database.py...")
        _pg_pool = ConnectionPool(
            conninfo=settings.DATABASE_URL,
            min_size=1,
            max_size=20,
            open=True,
            max_lifetime=300.0,
            max_idle=60.0,
            check=ConnectionPool.check_connection,
            kwargs={
                "row_factory": dict_row,
                "autocommit": True,
                "application_name": "law-delegation-api",
                # prepare_threshold=None disables auto-prepared statements entirely.
                # psycopg3: 0 = prepare immediately (WRONG for pgBouncer), None = never prepare (CORRECT)
                # Required for Supabase pgBouncer Transaction pooler (port 6543).
                "prepare_threshold": None,
            },
        )
    return _pg_pool


def close_postgres_pool():
    """Shutdown the PostgreSQL connection pool."""
    global _pg_pool
    if _pg_pool is not None:
        logger.info("Closing PostgreSQL Connection Pool in database.py...")
        _pg_pool.close()
        _pg_pool = None


@contextmanager
def get_db_conn():
    """Context manager for thread-safe database connections, supporting SQLite and Postgres."""
    if os.environ.get("TEST_MODE", "").lower() in ("1", "true", "yes") and settings.DB_PROVIDER == "postgres":
        raise RuntimeError(
            "CRITICAL SECURITY BLOCK: Unit tests are strictly forbidden from connecting to PostgreSQL / Supabase!"
        )

    if settings.DB_PROVIDER == "postgres":
        pool = get_postgres_pool()
        conn = pool.getconn(timeout=2.0)
        try:
            yield conn
        finally:
            pool.putconn(conn)
    else:
        db_path = get_db_path()
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        conn = sqlite3.connect(db_path, timeout=30.0)
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.row_factory = sqlite3.Row
        try:
            if os.environ.get("TEST_MODE", "").lower() in ("1", "true", "yes"):
                from app.tests.base import SafeTestConnection

                yield SafeTestConnection(conn)
            else:
                yield conn
        finally:
            conn.close()


def init_db():
    """Initialize the database based on the selected DB_PROVIDER."""
    if settings.DB_PROVIDER == "postgres":
        init_postgres_db()
    else:
        init_sqlite_db()


def init_postgres_db():
    """Delegate to schema module for PostgreSQL initialization."""
    schema_init_postgres()


def init_sqlite_db():
    """Delegate to schema module for SQLite initialization."""
    schema_init_sqlite()


def _clean_bloated_coded_values(conn_or_cursor, is_postgres: bool = False):
    """Delegate to schema module for coded_values cleanup."""
    schema_clean_bloated(conn_or_cursor, is_postgres=is_postgres)


__all__ = [
    "get_db_path",
    "get_postgres_pool",
    "close_postgres_pool",
    "get_db_conn",
    "init_db",
    "init_postgres_db",
    "init_sqlite_db",
    "_clean_bloated_coded_values",
    "hash_password",
    "verify_password",
]
