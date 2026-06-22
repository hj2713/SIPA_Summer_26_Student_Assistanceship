import os
import sys

# Activate test mode connection wrapper and query firewall.
os.environ["TEST_MODE"] = "1"

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


@pytest.fixture(autouse=True)
def db_safety_shield():
    """Global shield to intercept and prevent any deletion of the production SQLite database file during any test."""
    original_remove = os.remove
    original_unlink = os.unlink

    def safe_remove(path, *args, **kwargs):
        path_str = str(path)
        if "local_rag.db" in path_str and "test_local_rag.db" not in path_str:
            raise RuntimeError(
                f"CRITICAL SAFETY SHIELD: Deleting production database file '{path}' is strictly forbidden!"
            )
        return original_remove(path, *args, **kwargs)

    def safe_unlink(path, *args, **kwargs):
        path_str = str(path)
        if "local_rag.db" in path_str and "test_local_rag.db" not in path_str:
            raise RuntimeError(
                f"CRITICAL SAFETY SHIELD: Deleting production database file '{path}' is strictly forbidden!"
            )
        return original_unlink(path, *args, **kwargs)

    from unittest.mock import patch
    with patch("os.remove", side_effect=safe_remove), patch("os.unlink", side_effect=safe_unlink):
        yield


@pytest.fixture()
def client():
    """Test client — uses whatever DB_PROVIDER and JWT_SECRET are set in the environment."""
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def run_init_db():
    """Ensure a clean, initialized database exists for each test run.
    
    Safe to use with SQLite and Postgres/Supabase. Only cleans test records.
    """
    from app.core.database import init_db
    init_db()
    
    from app.tests.base import get_current_permissions
    
    # We temporarily grant deletion/insert permission for database cleanup
    perms = get_current_permissions()
    old_perms = perms.copy()
    perms["allow_insert"] = True
    perms["allow_delete"] = True
    
    try:
        if settings.DB_PROVIDER == "postgres":
            # Obtain psycopg connection directly to run deletions safely
            import psycopg
            # prepare_threshold=None is needed for Supabase Transaction mode
            with psycopg.connect(settings.DATABASE_URL, prepare_threshold=None) as conn:
                from app.tests.base import SafeTestConnection
                # Wrap with SafeTestConnection so cleanup itself is validated
                safe_conn = SafeTestConnection(conn)
                with safe_conn.cursor() as cur:
                    # Cascade deletes via deleting test user documents and test workspace dashboards
                    cur.execute("DELETE FROM document_chunks WHERE user_id = %s;", (TEST_USER_ID,))
                    cur.execute("DELETE FROM documents WHERE user_id = %s;", (TEST_USER_ID,))
                    cur.execute("DELETE FROM messages WHERE user_id = %s;", (TEST_USER_ID,))
                    cur.execute("DELETE FROM threads WHERE user_id = %s;", (TEST_USER_ID,))
                    cur.execute("DELETE FROM dashboards WHERE workspace_id = 'QA';")
                    cur.execute("DELETE FROM users WHERE id = %s OR email = %s;", (TEST_USER_ID, "test@test.com"))
                    cur.execute(
                        "INSERT INTO users (id, email, password_hash, is_admin, can_add, can_delete) VALUES (%s, %s, %s, 1, 1, 1);",
                        (TEST_USER_ID, "test@test.com", "mock_hash")
                    )
                safe_conn.commit()
        else:
            from app.core.database import get_db_conn
            with get_db_conn() as conn:
                # Direct SQL deletes of test-specific records
                conn.execute("DELETE FROM document_chunks WHERE user_id = ?;", (TEST_USER_ID,))
                conn.execute("DELETE FROM documents WHERE user_id = ?;", (TEST_USER_ID,))
                conn.execute("DELETE FROM messages WHERE user_id = ?;", (TEST_USER_ID,))
                conn.execute("DELETE FROM threads WHERE user_id = ?;", (TEST_USER_ID,))
                conn.execute("DELETE FROM dashboards WHERE workspace_id = 'QA';")
                conn.execute("DELETE FROM users WHERE id = ? OR email = ?;", (TEST_USER_ID, "test@test.com"))
                conn.execute(
                    "INSERT OR REPLACE INTO users (id, email, password_hash, is_admin, can_add, can_delete) VALUES (?, ?, ?, 1, 1, 1);",
                    (TEST_USER_ID, "test@test.com", "mock_hash")
                )
                conn.commit()
    finally:
        perms.update(old_perms)


@pytest.fixture(autouse=True)
def grant_test_db_permissions():
    """Automatically grant scoped write/delete permissions for tests.
    
    Operations are still strictly validated by the SafeTestCursor firewall (registry of allowed IDs).
    """
    from app.tests.base import get_current_permissions
    perms = get_current_permissions()
    old_perms = perms.copy()
    perms["allow_insert"] = True
    perms["allow_update"] = True
    perms["allow_delete"] = True
    yield
    perms.update(old_perms)




@pytest.fixture()
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_jwt()}"}


@pytest.fixture()
def expired_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_jwt(expired=True)}"}
