"""Schema definitions, DDL execution, database migrations, and seed logic.

Separates raw SQL schema statements and data migrations from core database connection pooling.
"""
import os
import sqlite3
import hashlib
import json
import uuid
import logging
from pathlib import Path
from app.core.config import settings

logger = logging.getLogger(__name__)

SCHEMAS_DIR = Path(__file__).resolve().parent.parent / "db" / "schemas"


def load_schema_sql(filename: str) -> str:
    """Load raw SQL schema from the schemas directory."""
    file_path = SCHEMAS_DIR / filename
    if not file_path.exists():
        raise FileNotFoundError(f"Schema file not found at {file_path}")
    return file_path.read_text(encoding="utf-8")


def hash_password(password: str) -> str:
    """Hash password using PBKDF2 with SHA-256."""
    salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000)
    return salt.hex() + ":" + key.hex()


def verify_password(password: str, hashed: str) -> bool:
    """Verify standard PBKDF2 hash against input password."""
    if not hashed or ":" not in hashed:
        return False
    try:
        salt_hex, key_hex = hashed.split(":")
        salt = bytes.fromhex(salt_hex)
        expected_key = bytes.fromhex(key_hex)
        actual_key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000)
        return expected_key == actual_key
    except Exception:
        return False


def init_postgres_db():
    """Create PostgreSQL tables, enable extensions, and seed default records."""
    if os.environ.get("TEST_MODE", "").lower() in ("1", "true", "yes"):
        raise RuntimeError(
            "CRITICAL SECURITY BLOCK: Unit tests are strictly forbidden from connecting to PostgreSQL / Supabase!"
        )

    import psycopg

    if not settings.DATABASE_URL:
        raise ValueError("DATABASE_URL is not set but DB_PROVIDER is postgres")

    logger.info("Initializing PostgreSQL schema and seed records...")
    # prepare_threshold=None disables auto-prepared statements for pgBouncer Transaction mode (port 6543)
    conn = psycopg.connect(settings.DATABASE_URL, prepare_threshold=None)
    conn.autocommit = True

    try:
        with conn.cursor() as cursor:
            # 1. Execute full DDL schema from SQL file
            postgres_sql = load_schema_sql("postgres_schema.sql")
            cursor.execute(postgres_sql)

            # 2. Seed test@gmail.com — regular user
            cursor.execute("SELECT id FROM users WHERE email = %s;", ("test@gmail.com",))
            admin_row = cursor.fetchone()
            admin_pwd_hash = hash_password("test@gmail.com")
            if not admin_row:
                cursor.execute(
                    "INSERT INTO users (id, email, password_hash, is_admin, can_add, can_delete) VALUES (%s, %s, %s, 0, 1, 1);",
                    (str(uuid.uuid4()), "test@gmail.com", admin_pwd_hash),
                )
            else:
                cursor.execute(
                    "UPDATE users SET password_hash = %s, is_admin = 0, can_add = 1, can_delete = 1 WHERE email = %s;",
                    (admin_pwd_hash, "test@gmail.com"),
                )

            # 3. Seed test@test.com — regular user
            cursor.execute("SELECT id FROM users WHERE email = %s;", ("test@test.com",))
            test_row = cursor.fetchone()
            test_pwd_hash = hash_password("test@test.com")
            if not test_row:
                cursor.execute(
                    "INSERT INTO users (id, email, password_hash, is_admin, can_add, can_delete) VALUES (%s, %s, %s, 0, 1, 1);",
                    ("00000000-0000-0000-0000-000000000001", "test@test.com", test_pwd_hash),
                )
            else:
                cursor.execute(
                    "UPDATE users SET password_hash = %s, is_admin = 0, can_add = 1, can_delete = 1 WHERE email = %s;",
                    (test_pwd_hash, "test@test.com"),
                )

            # 4. Remove UNIQUE constraint on workspace name if present
            try:
                cursor.execute("ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_name_key;")
            except Exception:
                pass

            # 5. Migrate legacy 'PRODUCTION' workspace ID
            try:
                cursor.execute("UPDATE workspaces SET id = 'ws_prod_00000001' WHERE id = 'PRODUCTION';")
                cursor.execute("UPDATE workspace_memberships SET workspace_id = 'ws_prod_00000001' WHERE workspace_id = 'PRODUCTION';")
                cursor.execute("UPDATE documents SET workspace_id = 'ws_prod_00000001' WHERE workspace_id = 'PRODUCTION';")
                cursor.execute("UPDATE dashboards SET workspace_id = 'ws_prod_00000001' WHERE workspace_id = 'PRODUCTION';")
                cursor.execute("UPDATE coding_workflows SET workspace_id = 'ws_prod_00000001' WHERE workspace_id = 'PRODUCTION';")
            except Exception as mig_err:
                logger.warning("Workspace ID migration note: %s", mig_err)

            # 6. Ensure default workspaces exist
            cursor.execute("INSERT INTO workspaces (id, name, created_by) VALUES ('ws_system_templates', 'System Templates', 'system') ON CONFLICT (id) DO NOTHING;")
            cursor.execute("INSERT INTO workspaces (id, name, created_by) VALUES ('ws_prod_00000001', 'PRODUCTION', 'test@gmail.com') ON CONFLICT (id) DO NOTHING;")
            cursor.execute("INSERT INTO workspaces (id, name) VALUES ('QA', 'QA') ON CONFLICT (id) DO NOTHING;")
            cursor.execute("INSERT INTO workspaces (id, name) VALUES ('TEST', 'TEST') ON CONFLICT (id) DO NOTHING;")

            # 7. Seed memberships
            cursor.execute(
                "INSERT INTO workspace_memberships (id, workspace_id, user_email, role) VALUES (%s, %s, %s, 'owner') ON CONFLICT (workspace_id, user_email) DO UPDATE SET role = 'owner';",
                (str(uuid.uuid4()), "ws_prod_00000001", "test@gmail.com"),
            )
            cursor.execute(
                "INSERT INTO workspace_memberships (id, workspace_id, user_email, role) VALUES (%s, %s, %s, 'member') ON CONFLICT DO NOTHING;",
                (str(uuid.uuid4()), "ws_prod_00000001", "test@test.com"),
            )
            cursor.execute(
                "INSERT INTO workspace_memberships (id, workspace_id, user_email, role) VALUES (%s, 'TEST', 'test@test.com', 'member') ON CONFLICT DO NOTHING;",
                (str(uuid.uuid4()),),
            )

            # 8. Backfill owner role for creators
            cursor.execute("""
                UPDATE workspace_memberships SET role = 'owner'
                WHERE (workspace_id, user_email) IN (
                    SELECT w.id, w.created_by FROM workspaces w WHERE w.created_by IS NOT NULL
                ) AND role != 'owner';
            """)

            # 9. Requirement 4: Reset hj2713@columbia.edu for uninvited state testing when not in TEST_MODE
            if not os.environ.get("TEST_MODE"):
                cursor.execute("UPDATE users SET is_admin = 0, can_add = 0, can_delete = 0 WHERE email = %s;", ("hj2713@columbia.edu",))
                cursor.execute("DELETE FROM workspace_memberships WHERE LOWER(user_email) = %s;", ("hj2713@columbia.edu",))
            else:
                cursor.execute("UPDATE users SET is_admin = 1, can_add = 1, can_delete = 1 WHERE email = %s;", ("hj2713@columbia.edu",))

            # 10. Database cleanup: strip legacy embedded trace/context from coded_values
            _clean_bloated_coded_values(cursor, is_postgres=True)

    finally:
        conn.close()


def init_sqlite_db():
    """Create all SQLite tables, run defensive migrations, and seed defaults."""
    from app.core.database import get_db_conn

    with get_db_conn() as conn:
        # 1. Execute full DDL schema from SQL file
        sqlite_sql = load_schema_sql("sqlite_schema.sql")
        conn.executescript(sqlite_sql)

        # 2. Defensive schema migrations for existing SQLite databases
        for col in ["llm_provider", "llm_api_key_encrypted", "llm_model", "llm_base_url", "llm_key_preference"]:
            try:
                conn.execute(f"ALTER TABLE users ADD COLUMN {col} TEXT;")
            except sqlite3.OperationalError:
                pass

        for table in ["documents", "document_chunks"]:
            try:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;")
            except sqlite3.OperationalError:
                pass

        for col, col_type in [("created_by", "TEXT DEFAULT 'test@test.com'"), ("campaign_flow", "TEXT DEFAULT 'RAG Structured Extraction Flow'"), ("is_frozen", "INTEGER DEFAULT 1")]:
            try:
                conn.execute(f"ALTER TABLE dashboards ADD COLUMN {col} {col_type};")
            except sqlite3.OperationalError:
                pass

        for col, col_type in [("role", "TEXT NOT NULL DEFAULT 'member'"), ("status", "TEXT NOT NULL DEFAULT 'active'"), ("created_by", "TEXT")]:
            tbl = "workspaces" if col == "created_by" else "workspace_memberships"
            try:
                conn.execute(f"ALTER TABLE {tbl} ADD COLUMN {col} {col_type};")
            except sqlite3.OperationalError:
                pass

        for col, col_type in [("cached_tokens", "INTEGER DEFAULT 0"), ("generation_id", "TEXT")]:
            try:
                conn.execute(f"ALTER TABLE llm_usage_logs ADD COLUMN {col} {col_type};")
            except sqlite3.OperationalError:
                pass

        # 3. Seed test@gmail.com
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE email = ?;", ("test@gmail.com",))
        admin_row = cursor.fetchone()
        admin_pwd_hash = hash_password("test@gmail.com")
        if not admin_row:
            admin_id = str(uuid.uuid4())
            conn.execute(
                "INSERT INTO users (id, email, password_hash, is_admin, can_add, can_delete) VALUES (?, ?, ?, 0, 1, 1);",
                (admin_id, "test@gmail.com", admin_pwd_hash),
            )
        else:
            conn.execute(
                "UPDATE users SET password_hash = ?, is_admin = 0, can_add = 1, can_delete = 1 WHERE email = ?;",
                (admin_pwd_hash, "test@gmail.com"),
            )

        # 4. Seed test@test.com
        cursor.execute("SELECT id FROM users WHERE email = ?;", ("test@test.com",))
        test_row = cursor.fetchone()
        test_pwd_hash = hash_password("test@test.com")
        if not test_row:
            conn.execute(
                "INSERT OR IGNORE INTO users (id, email, password_hash, is_admin, can_add, can_delete) VALUES (?, ?, ?, 0, 1, 1);",
                ("00000000-0000-0000-0000-000000000001", "test@test.com", test_pwd_hash),
            )
        else:
            conn.execute(
                "UPDATE users SET password_hash = ?, is_admin = 0, can_add = 1, can_delete = 1 WHERE email = ?;",
                (test_pwd_hash, "test@test.com"),
            )

        # 5. Seed default workspaces
        conn.execute("INSERT OR IGNORE INTO workspaces (id, name, created_by) VALUES ('ws_system_templates', 'System Templates', 'system');")
        conn.execute("INSERT OR IGNORE INTO workspaces (id, name, created_by) VALUES ('ws_prod_00000001', 'PRODUCTION', 'test@gmail.com');")
        conn.execute("INSERT OR IGNORE INTO workspaces (id, name) VALUES ('QA', 'QA');")
        conn.execute("INSERT OR IGNORE INTO workspaces (id, name) VALUES ('TEST', 'TEST');")

        # 6. Seed workspace memberships
        conn.execute(
            "INSERT OR REPLACE INTO workspace_memberships (id, workspace_id, user_email, role) VALUES (?, 'ws_prod_00000001', 'test@gmail.com', 'owner');",
            (str(uuid.uuid4()),),
        )
        conn.execute(
            "INSERT OR IGNORE INTO workspace_memberships (id, workspace_id, user_email, role) VALUES (?, 'ws_prod_00000001', 'test@test.com', 'member');",
            (str(uuid.uuid4()),),
        )
        conn.execute(
            "INSERT OR IGNORE INTO workspace_memberships (id, workspace_id, user_email, role) VALUES (?, 'TEST', 'test@test.com', 'member');",
            (str(uuid.uuid4()),),
        )

        # 7. Requirement 4: Reset hj2713@columbia.edu for uninvited state testing when not in TEST_MODE
        if not os.environ.get("TEST_MODE"):
            conn.execute("UPDATE users SET is_admin = 0, can_add = 0, can_delete = 0 WHERE email = ?;", ("hj2713@columbia.edu",))
            conn.execute("DELETE FROM workspace_memberships WHERE LOWER(user_email) = ?;", ("hj2713@columbia.edu",))
        else:
            conn.execute("UPDATE users SET is_admin = 1, can_add = 1, can_delete = 1 WHERE email = ?;", ("hj2713@columbia.edu",))

        # 8. Database cleanup: strip legacy embedded trace/context from coded_values
        _clean_bloated_coded_values(conn, is_postgres=False)

        conn.commit()


def _clean_bloated_coded_values(conn_or_cursor, is_postgres: bool = False):
    """Database cleanup: strip bulky trace and context from coded_values column directly in the database.

    Extracts embedded traces/contexts to workflow_trace/workflow_context (if not already set),
    shrinking stored coded_values row size by ~98% directly in PostgreSQL/Supabase and SQLite.
    """
    try:
        select_sql = (
            "SELECT dashboard_id, document_id, coded_values, workflow_trace, workflow_context "
            "FROM dashboard_documents "
            "WHERE coded_values LIKE '%\"trace\"%' OR coded_values LIKE '%\"context\"%';"
        )
        cursor = conn_or_cursor if is_postgres else conn_or_cursor.cursor()
        cursor.execute(select_sql)
        rows = cursor.fetchall()
        if not rows:
            return

        update_sql = (
            """
            UPDATE dashboard_documents
            SET coded_values = %s,
                workflow_trace = COALESCE(workflow_trace, %s),
                workflow_context = COALESCE(workflow_context, %s)
            WHERE dashboard_id = %s AND document_id = %s;
        """
            if is_postgres
            else """
            UPDATE dashboard_documents
            SET coded_values = ?,
                workflow_trace = COALESCE(workflow_trace, ?),
                workflow_context = COALESCE(workflow_context, ?)
            WHERE dashboard_id = ? AND document_id = ?;
        """
        )

        for r in rows:
            row_dict = (
                dict(r)
                if hasattr(r, "keys")
                else {
                    "dashboard_id": r[0],
                    "document_id": r[1],
                    "coded_values": r[2],
                    "workflow_trace": r[3],
                    "workflow_context": r[4],
                }
            )
            raw = row_dict.get("coded_values")
            if not raw or not isinstance(raw, str):
                continue
            try:
                data = json.loads(raw)
            except Exception:
                continue
            if not isinstance(data, dict):
                continue

            extracted_traces = {}
            extracted_contexts = {}
            cleaned_data = {}
            modified = False

            for k, v in data.items():
                if isinstance(v, dict) and ("values" in v or "status" in v):
                    model_run = dict(v)
                    if "trace" in model_run:
                        extracted_traces[k] = model_run.pop("trace")
                        modified = True
                    if "context" in model_run:
                        extracted_contexts[k] = model_run.pop("context")
                        modified = True
                    cleaned_data[k] = model_run
                else:
                    cleaned_data[k] = v

            if modified:
                new_coded = json.dumps(cleaned_data)
                existing_trace = row_dict.get("workflow_trace")
                existing_ctx = row_dict.get("workflow_context")
                new_trace = existing_trace or (json.dumps(extracted_traces) if extracted_traces else None)
                new_ctx = existing_ctx or (json.dumps(extracted_contexts) if extracted_contexts else None)
                cursor.execute(
                    update_sql,
                    (new_coded, new_trace, new_ctx, row_dict["dashboard_id"], row_dict["document_id"]),
                )
    except Exception as e:
        logger.warning(f"Database cleanup of bloated coded_values note: {e}")

