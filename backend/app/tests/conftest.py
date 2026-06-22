import sys
from unittest.mock import MagicMock

# Mock docling package dynamically if not installed to prevent import errors in tests
try:
    import docling
except ImportError:
    docling_mock = MagicMock()
    sys.modules["docling"] = docling_mock
    sys.modules["docling.document_converter"] = MagicMock()
    sys.modules["docling.datamodel"] = MagicMock()
    sys.modules["docling.datamodel.accelerator_options"] = MagicMock()
    sys.modules["docling.datamodel.pipeline_options"] = MagicMock()
    sys.modules["docling.datamodel.base_models"] = MagicMock()

import os
import time

# Load settings from env/.env — no hardcoded values here ever.
# JWT_SECRET and DB_PROVIDER are fully controlled by the environment.
from app.core.config import settings

# Use the JWT_SECRET already resolved by settings (from .env or env var).
# This is the same secret the running app uses, so tokens stay valid.
TEST_SECRET = settings.JWT_SECRET

import jwt
import pytest
from fastapi.testclient import TestClient

from app.main import app


TEST_USER_ID = "00000000-0000-0000-0000-000000000001"


def make_jwt(user_id: str = TEST_USER_ID, expired: bool = False) -> str:
    """Generate a test JWT signed with TEST_SECRET."""
    now = int(time.time())
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + (-1 if expired else 3600),
    }
    return jwt.encode(payload, TEST_SECRET, algorithm="HS256")


@pytest.fixture(scope="session", autouse=True)
def cleanup_test_db():
    """Set up test session environment and clean the test SQLite DB if using SQLite."""
    # Signal get_db_path() to use the isolated test database file (SQLite only).
    os.environ["TEST_MODE"] = "1"

    if settings.DB_PROVIDER != "postgres":
        from app.core.database import get_db_path
        db_path = get_db_path()
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
            except OSError:
                pass
    yield

    # Clean up TEST_MODE after the session
    os.environ.pop("TEST_MODE", None)


@pytest.fixture()
def client():
    """Test client — uses whatever DB_PROVIDER and JWT_SECRET are set in the environment."""
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def run_init_db():
    """Ensure a clean, initialized database exists for each test run.

    Works transparently with both SQLite (local) and Postgres/Supabase.
    The active backend is determined entirely by DB_PROVIDER in the environment.
    """
    from app.core.database import init_db
    init_db()

    if settings.DB_PROVIDER == "postgres":
        # Postgres/Supabase path — use psycopg directly
        import psycopg
        with psycopg.connect(settings.DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM document_chunks;")
                cur.execute("DELETE FROM documents;")
                cur.execute("DELETE FROM messages;")
                cur.execute("DELETE FROM threads;")
                cur.execute("DELETE FROM users WHERE email = %s;", ("test@test.com",))
                cur.execute(
                    "INSERT INTO users (id, email, password_hash, is_admin, can_add, can_delete) "
                    "VALUES (%s, %s, %s, 1, 1, 1) ON CONFLICT (id) DO UPDATE "
                    "SET password_hash = EXCLUDED.password_hash;",
                    (TEST_USER_ID, "test@test.com", "mock_hash")
                )
            conn.commit()
    else:
        # SQLite path
        from app.core.database import get_db_conn
        with get_db_conn() as conn:
            conn.execute("DELETE FROM document_chunks;")
            conn.execute("DELETE FROM documents;")
            conn.execute("DELETE FROM messages;")
            conn.execute("DELETE FROM threads;")
            conn.execute("DELETE FROM users;")
            conn.execute(
                "INSERT OR REPLACE INTO users (id, email, password_hash, is_admin, can_add, can_delete) VALUES (?, ?, ?, 1, 1, 1);",
                (TEST_USER_ID, "test@test.com", "mock_hash")
            )
            conn.commit()


@pytest.fixture()
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_jwt()}"}


@pytest.fixture()
def expired_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_jwt(expired=True)}"}
