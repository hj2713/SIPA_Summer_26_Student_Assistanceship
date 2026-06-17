import os
import time

# Force test secret globally before other modules import settings
TEST_SECRET = "test-secret-32-bytes-long-enough!!"
os.environ["JWT_SECRET"] = TEST_SECRET
from app.core.config import settings
settings.JWT_SECRET = TEST_SECRET

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
    """Delete test database file once at the very start of the test session."""
    from app.core.database import get_db_path
    db_path = get_db_path()
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass
    yield


@pytest.fixture()
def client(monkeypatch):
    """Test client with JWT secret patched."""
    monkeypatch.setenv("JWT_SECRET", TEST_SECRET)
    # Re-import settings so monkeypatch takes effect
    from app.core import config
    config.settings.JWT_SECRET = TEST_SECRET
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def run_init_db():
    """Ensure a clean, initialized database exists for each test run."""
    from app.core.database import init_db, get_db_conn
    init_db()
    # Seed default test user to satisfy local deps JWT validation
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
