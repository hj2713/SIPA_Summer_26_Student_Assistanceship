import os
import sqlite3
import hashlib
import json
import uuid
from contextlib import contextmanager
from app.core.config import settings

def get_db_path() -> str:
    is_test = settings.JWT_SECRET == "test-secret-32-bytes-long-enough!!"
    if is_test:
        return "data/test_local_rag.db"
    return "data/local_rag.db"

@contextmanager
def get_db_conn():
    """Context manager for thread-safe SQLite connections."""
    db_path = get_db_path()
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=30.0)
    # Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    """Create all SQLite tables if they do not exist, run migrations, and seed defaults."""
    db_path = get_db_path()
    
    with get_db_conn() as conn:
        # Create workspaces table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );
        """)

        # Create users table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0,
                can_add INTEGER NOT NULL DEFAULT 0,
                can_delete INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );
        """)

        # Create threads table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS threads (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT 'New conversation',
                provider TEXT NOT NULL DEFAULT 'openai',
                provider_thread_id TEXT,
                model TEXT,
                dashboard_id TEXT,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (dashboard_id) REFERENCES dashboards (id) ON DELETE CASCADE
            );
        """)

        # Create messages table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
                content TEXT NOT NULL,
                provider_response_id TEXT,
                tokens_input INTEGER,
                tokens_output INTEGER,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                FOREIGN KEY (thread_id) REFERENCES threads (id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            );
        """)

        # Create documents table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                workspace_id TEXT DEFAULT 'TEST',
                filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                content_type TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
                error_message TEXT,
                content_hash TEXT,
                metadata TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
                UNIQUE (workspace_id, filename)
            );
        """)

        # Create document_chunks table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS document_chunks (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                workspace_id TEXT DEFAULT 'TEST',
                content TEXT NOT NULL,
                embedding TEXT, -- JSON array of floats
                metadata TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
            );
        """)

        # Create dashboards table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS dashboards (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                prompt TEXT NOT NULL,
                schema TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );
        """)

        # Create dashboard_documents table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS dashboard_documents (
                dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
                document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                coded_values TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
                error_message TEXT,
                error_type TEXT CHECK(error_type IN ('API_FAILURE', 'COMPREHENSION_FAILURE', 'EXTRACTION_FAILURE')),
                current_step INTEGER DEFAULT 0,
                total_steps INTEGER DEFAULT 7,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                PRIMARY KEY (dashboard_id, document_id)
            );
        """)

        # --- DB Migrations for existing databases ---
        # Add model column to threads and dashboards tables defensively
        try:
            conn.execute("ALTER TABLE threads ADD COLUMN model TEXT;")
        except sqlite3.OperationalError:
            pass

        try:
            conn.execute("ALTER TABLE threads ADD COLUMN dashboard_id TEXT REFERENCES dashboards(id) ON DELETE CASCADE;")
        except sqlite3.OperationalError:
            pass

        try:
            conn.execute("ALTER TABLE dashboards ADD COLUMN model TEXT;")
        except sqlite3.OperationalError:
            pass

        # Create llm_usage_logs table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS llm_usage_logs (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                service TEXT NOT NULL,
                campaign_id TEXT,
                thread_id TEXT,
                input_tokens INTEGER NOT NULL DEFAULT 0,
                output_tokens INTEGER NOT NULL DEFAULT 0,
                calculated_cost REAL NOT NULL DEFAULT 0.0,
                FOREIGN KEY (campaign_id) REFERENCES dashboards (id) ON DELETE SET NULL,
                FOREIGN KEY (thread_id) REFERENCES threads (id) ON DELETE SET NULL
            );
        """)

        # Add current_step and total_steps to dashboard_documents defensively
        for col, default_val in [("current_step", 0), ("total_steps", 7)]:
            try:
                conn.execute(f"ALTER TABLE dashboard_documents ADD COLUMN {col} INTEGER DEFAULT {default_val};")
            except sqlite3.OperationalError:
                pass

        # Add columns to users table defensively
        for col, default_val in [("is_admin", 0), ("can_add", 0), ("can_delete", 0)]:
            try:
                conn.execute(f"ALTER TABLE users ADD COLUMN {col} INTEGER NOT NULL DEFAULT {default_val};")
            except sqlite3.OperationalError:
                pass

        # Add workspace_id columns defensively
        for table in ["documents", "document_chunks"]:
            try:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;")
            except sqlite3.OperationalError:
                pass

        # Create indexes
        conn.execute("CREATE INDEX IF NOT EXISTS idx_threads_user_updated ON threads (user_id, updated_at DESC);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_thread_created ON messages (thread_id, created_at ASC);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON document_chunks (document_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents (user_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents (workspace_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_chunks_workspace ON document_chunks (workspace_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_dashboards_workspace ON dashboards (workspace_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_dash_docs_dashboard ON dashboard_documents (dashboard_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_dash_docs_document ON dashboard_documents (document_id);")

        # --- SEED DEFAULTS ---
        # 1. TEST Workspace
        conn.execute("INSERT OR IGNORE INTO workspaces (id, name) VALUES ('TEST', 'TEST');")

        # 2. Default Admin User: test@gmail.com / test@gmail.com
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE email = ?;", ("test@gmail.com",))
        admin_row = cursor.fetchone()
        if not admin_row:
            admin_id = str(uuid.uuid4())
            admin_pwd_hash = hash_password("test@gmail.com")
            conn.execute(
                "INSERT INTO users (id, email, password_hash, is_admin, can_add, can_delete) VALUES (?, ?, ?, 1, 1, 1);",
                (admin_id, "test@gmail.com", admin_pwd_hash)
            )
        else:
            admin_pwd_hash = hash_password("test@gmail.com")
            conn.execute(
                "UPDATE users SET password_hash = ?, is_admin = 1, can_add = 1, can_delete = 1 WHERE email = ?;",
                (admin_pwd_hash, "test@gmail.com")
            )

        # 2b. Also seed test@test.com as default admin (easy to remember)
        cursor.execute("SELECT id FROM users WHERE email = ?;", ("test@test.com",))
        test_row = cursor.fetchone()
        test_pwd_hash = hash_password("test@test.com")
        if not test_row:
            test_id = str(uuid.uuid4())
            conn.execute(
                "INSERT INTO users (id, email, password_hash, is_admin, can_add, can_delete) VALUES (?, ?, ?, 1, 1, 1);",
                (test_id, "test@test.com", test_pwd_hash)
            )
        else:
            conn.execute(
                "UPDATE users SET password_hash = ?, is_admin = 1, can_add = 1, can_delete = 1 WHERE email = ?;",
                (test_pwd_hash, "test@test.com")
            )

        # 3. Migrate any legacy NULL workspace rows to the 'TEST' workspace
        conn.execute("UPDATE documents SET workspace_id = 'TEST' WHERE workspace_id IS NULL;")
        conn.execute("UPDATE document_chunks SET workspace_id = 'TEST' WHERE workspace_id IS NULL;")

        conn.commit()

# Password Hashing Helper using pbkdf2
def hash_password(password: str) -> str:
    """Hash password using PBKDF2 with SHA-256."""
    salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return salt.hex() + ":" + key.hex()

def verify_password(password: str, hashed: str) -> bool:
    """Verify standard PBKDF2 hash against input password."""
    if not hashed or ":" not in hashed:
        return False
    try:
        salt_hex, key_hex = hashed.split(":")
        salt = bytes.fromhex(salt_hex)
        expected_key = bytes.fromhex(key_hex)
        actual_key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
        return expected_key == actual_key
    except Exception:
        return False
