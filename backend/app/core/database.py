import os
import sqlite3
import hashlib
import json
import uuid
import logging
from contextlib import contextmanager
from app.core.config import settings

logger = logging.getLogger(__name__)


def get_db_path() -> str:
    # Use TEST_MODE env var to select the test database path.
    # Never rely on a hardcoded secret string for environment detection.
    if os.environ.get("TEST_MODE", "").lower() in ("1", "true", "yes"):
        return "data/test_local_rag.db"
    return "data/local_rag.db"

@contextmanager
def get_db_conn():
    """Context manager for thread-safe database connections, supporting SQLite and Postgres."""
    if settings.DB_PROVIDER == "postgres":
        import psycopg
        from psycopg.rows import dict_row
        conn = psycopg.connect(settings.DATABASE_URL, row_factory=dict_row, prepare_threshold=None)
        try:
            if os.environ.get("TEST_MODE", "").lower() in ("1", "true", "yes"):
                from app.tests.base import SafeTestConnection
                yield SafeTestConnection(conn)
            else:
                yield conn
        finally:
            conn.close()
    else:
        db_path = get_db_path()
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        conn = sqlite3.connect(db_path, timeout=30.0)
        # Enable foreign keys
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
    """Create PostgreSQL tables, enable pgvector, and seed defaults."""
    import psycopg
    if not settings.DATABASE_URL:
        raise ValueError("DATABASE_URL is not set but DB_PROVIDER is postgres")
    
    logger.info("Initializing PostgreSQL database...")
    # prepare_threshold=None disables ALL auto-prepared statements.
    # psycopg3: 0 = prepare everything immediately (WRONG for pgBouncer)
    #           None = never auto-prepare (CORRECT for pgBouncer Transaction mode)
    conn = psycopg.connect(settings.DATABASE_URL, prepare_threshold=None)
    conn.autocommit = True
    
    try:
        with conn.cursor() as cursor:
            # 1. Enable pgvector extension
            cursor.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            
            # 2. Create tables
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS workspaces (
                    id VARCHAR(255) PRIMARY KEY,
                    name VARCHAR(255) UNIQUE NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)
            
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id VARCHAR(255) PRIMARY KEY,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    is_admin INTEGER NOT NULL DEFAULT 0,
                    can_add INTEGER NOT NULL DEFAULT 0,
                    can_delete INTEGER NOT NULL DEFAULT 0,
                    llm_provider VARCHAR(50),
                    llm_api_key_encrypted TEXT,
                    llm_model VARCHAR(100),
                    llm_base_url TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)
            
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS dashboards (
                    id VARCHAR(255) PRIMARY KEY,
                    workspace_id VARCHAR(255) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                    name VARCHAR(255) NOT NULL,
                    description TEXT NOT NULL,
                    prompt TEXT NOT NULL,
                    schema TEXT NOT NULL DEFAULT '[]',
                    model VARCHAR(255),
                    dashboard_type VARCHAR(50) NOT NULL DEFAULT 'campaign',
                    workflow_id VARCHAR(255) REFERENCES coding_workflows(id) ON DELETE SET NULL,
                    workflow_source VARCHAR(50),
                    workflow_version INTEGER,
                    workflow_revision INTEGER,
                    workflow_definition_json TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS coding_workflows (
                    id VARCHAR(255) PRIMARY KEY,
                    workspace_id VARCHAR(255) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                    name VARCHAR(255) NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'archived')),
                    draft_definition TEXT NOT NULL,
                    revision INTEGER NOT NULL DEFAULT 1,
                    latest_version INTEGER NOT NULL DEFAULT 0,
                    created_by VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS coding_workflow_templates (
                    id VARCHAR(255) PRIMARY KEY,
                    workspace_id VARCHAR(255) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                    slug VARCHAR(255) NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    category VARCHAR(255) NOT NULL DEFAULT 'General',
                    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
                    definition_json TEXT NOT NULL,
                    revision INTEGER NOT NULL DEFAULT 1,
                    created_by VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(workspace_id, slug)
                );
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS coding_workflow_versions (
                    id VARCHAR(255) PRIMARY KEY,
                    workflow_id VARCHAR(255) NOT NULL REFERENCES coding_workflows(id) ON DELETE CASCADE,
                    version INTEGER NOT NULL,
                    definition_json TEXT NOT NULL,
                    definition_hash VARCHAR(255) NOT NULL,
                    changelog TEXT NOT NULL DEFAULT '',
                    created_by VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(workflow_id, version)
                );
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS threads (
                    id VARCHAR(255) PRIMARY KEY,
                    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    title VARCHAR(255) NOT NULL DEFAULT 'New conversation',
                    provider VARCHAR(50) NOT NULL DEFAULT 'openai',
                    provider_thread_id VARCHAR(255),
                    model VARCHAR(255),
                    dashboard_id VARCHAR(255) REFERENCES dashboards(id) ON DELETE CASCADE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id VARCHAR(255) PRIMARY KEY,
                    thread_id VARCHAR(255) NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
                    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
                    content TEXT NOT NULL,
                    provider_response_id VARCHAR(255),
                    tokens_input INTEGER,
                    tokens_output INTEGER,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS documents (
                    id VARCHAR(255) PRIMARY KEY,
                    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    workspace_id VARCHAR(255) REFERENCES workspaces(id) ON DELETE CASCADE,
                    filename VARCHAR(255) NOT NULL,
                    file_path TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    content_type VARCHAR(255) NOT NULL,
                    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
                    error_message TEXT,
                    content_hash VARCHAR(255),
                    metadata TEXT NOT NULL DEFAULT '{}',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (workspace_id, filename)
                );
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS document_chunks (
                    id VARCHAR(255) PRIMARY KEY,
                    document_id VARCHAR(255) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    workspace_id VARCHAR(255) REFERENCES workspaces(id) ON DELETE CASCADE,
                    content TEXT NOT NULL,
                    embedding vector,
                    metadata TEXT NOT NULL DEFAULT '{}',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS dashboard_documents (
                    dashboard_id VARCHAR(255) NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
                    document_id VARCHAR(255) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                    coded_values TEXT NOT NULL DEFAULT '{}',
                    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
                    error_message TEXT,
                    error_type VARCHAR(50) CHECK(error_type IN ('API_FAILURE', 'COMPREHENSION_FAILURE', 'EXTRACTION_FAILURE')),
                    current_step INTEGER DEFAULT 0,
                    total_steps INTEGER DEFAULT 7,
                    workflow_trace TEXT,
                    workflow_context TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (dashboard_id, document_id)
                );
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS llm_usage_logs (
                    id VARCHAR(255) PRIMARY KEY,
                    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    provider VARCHAR(255) NOT NULL,
                    model VARCHAR(255) NOT NULL,
                    service VARCHAR(255) NOT NULL,
                    campaign_id VARCHAR(255) REFERENCES dashboards(id) ON DELETE SET NULL,
                    thread_id VARCHAR(255) REFERENCES threads(id) ON DELETE SET NULL,
                    input_tokens INTEGER NOT NULL DEFAULT 0,
                    output_tokens INTEGER NOT NULL DEFAULT 0,
                    calculated_cost DOUBLE PRECISION NOT NULL DEFAULT 0.0
                );
            """)

            for ddl in [
                "ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS model VARCHAR(255);",
                "ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS dashboard_type VARCHAR(50) NOT NULL DEFAULT 'campaign';",
                "ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS workflow_id VARCHAR(255) REFERENCES coding_workflows(id) ON DELETE SET NULL;",
                "ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS workflow_source VARCHAR(50);",
                "ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS workflow_version INTEGER;",
                "ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS workflow_revision INTEGER;",
                "ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS workflow_definition_json TEXT;",
                "ALTER TABLE dashboard_documents ADD COLUMN IF NOT EXISTS workflow_trace TEXT;",
                "ALTER TABLE dashboard_documents ADD COLUMN IF NOT EXISTS workflow_context TEXT;",
            ]:
                cursor.execute(ddl)

            # Create indexes
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_threads_user_updated ON threads (user_id, updated_at DESC);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_messages_thread_created ON messages (thread_id, created_at ASC);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON document_chunks (document_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents (user_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents (workspace_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_chunks_workspace ON document_chunks (workspace_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_dashboards_workspace ON dashboards (workspace_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_dash_docs_dashboard ON dashboard_documents (dashboard_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_dash_docs_document ON dashboard_documents (document_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_workflows_workspace ON coding_workflows (workspace_id, updated_at DESC);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_workflow_templates_workspace ON coding_workflow_templates (workspace_id, updated_at DESC);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow ON coding_workflow_versions (workflow_id, version DESC);")

            # Seed test@gmail.com
            cursor.execute("SELECT id FROM users WHERE email = %s;", ("test@gmail.com",))
            admin_row = cursor.fetchone()
            admin_pwd_hash = hash_password("test@gmail.com")
            if not admin_row:
                import uuid
                cursor.execute(
                    "INSERT INTO users (id, email, password_hash, is_admin, can_add, can_delete) VALUES (%s, %s, %s, 1, 1, 1);",
                    (str(uuid.uuid4()), "test@gmail.com", admin_pwd_hash)
                )
            else:
                cursor.execute(
                    "UPDATE users SET password_hash = %s, is_admin = 1, can_add = 1, can_delete = 1 WHERE email = %s;",
                    (admin_pwd_hash, "test@gmail.com")
                )

            # Seed test@test.com
            cursor.execute("SELECT id FROM users WHERE email = %s;", ("test@test.com",))
            test_row = cursor.fetchone()
            test_pwd_hash = hash_password("test@test.com")
            if not test_row:
                import uuid
                cursor.execute(
                    "INSERT INTO users (id, email, password_hash, is_admin, can_add, can_delete) VALUES (%s, %s, %s, 1, 1, 1);",
                    (str(uuid.uuid4()), "test@test.com", test_pwd_hash)
                )
            else:
                cursor.execute(
                    "UPDATE users SET password_hash = %s, is_admin = 1, can_add = 1, can_delete = 1 WHERE email = %s;",
                    (test_pwd_hash, "test@test.com")
                )
    finally:
        conn.close()

def init_sqlite_db():
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
                llm_provider TEXT,
                llm_api_key_encrypted TEXT,
                llm_model TEXT,
                llm_base_url TEXT,
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
                workspace_id TEXT,
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
                workspace_id TEXT,
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
                model TEXT,
                dashboard_type TEXT NOT NULL DEFAULT 'campaign',
                workflow_id TEXT REFERENCES coding_workflows(id) ON DELETE SET NULL,
                workflow_source TEXT,
                workflow_version INTEGER,
                workflow_revision INTEGER,
                workflow_definition_json TEXT,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS coding_workflows (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'archived')),
                draft_definition TEXT NOT NULL,
                revision INTEGER NOT NULL DEFAULT 1,
                latest_version INTEGER NOT NULL DEFAULT 0,
                created_by TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS coding_workflow_templates (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                slug TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT 'General',
                status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
                definition_json TEXT NOT NULL,
                revision INTEGER NOT NULL DEFAULT 1,
                created_by TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                UNIQUE(workspace_id, slug)
            );
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS coding_workflow_versions (
                id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL REFERENCES coding_workflows(id) ON DELETE CASCADE,
                version INTEGER NOT NULL,
                definition_json TEXT NOT NULL,
                definition_hash TEXT NOT NULL,
                changelog TEXT NOT NULL DEFAULT '',
                created_by TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                UNIQUE(workflow_id, version)
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
                workflow_trace TEXT,
                workflow_context TEXT,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                PRIMARY KEY (dashboard_id, document_id)
            );
        """)

        # --- DB Migrations for existing databases ---
        # Add model/workflow columns to threads and dashboards tables defensively
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

        for col_def in [
            "dashboard_type TEXT NOT NULL DEFAULT 'campaign'",
            "workflow_id TEXT REFERENCES coding_workflows(id) ON DELETE SET NULL",
            "workflow_source TEXT",
            "workflow_version INTEGER",
            "workflow_revision INTEGER",
            "workflow_definition_json TEXT",
        ]:
            try:
                conn.execute(f"ALTER TABLE dashboards ADD COLUMN {col_def};")
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

        for col_def in ["workflow_trace TEXT", "workflow_context TEXT"]:
            try:
                conn.execute(f"ALTER TABLE dashboard_documents ADD COLUMN {col_def};")
            except sqlite3.OperationalError:
                pass

        # Add columns to users table defensively
        for col, default_val in [("is_admin", 0), ("can_add", 0), ("can_delete", 0)]:
            try:
                conn.execute(f"ALTER TABLE users ADD COLUMN {col} INTEGER NOT NULL DEFAULT {default_val};")
            except sqlite3.OperationalError:
                pass

        for col in ["llm_provider", "llm_api_key_encrypted", "llm_model", "llm_base_url"]:
            try:
                conn.execute(f"ALTER TABLE users ADD COLUMN {col} TEXT;")
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
        conn.execute("CREATE INDEX IF NOT EXISTS idx_workflows_workspace ON coding_workflows (workspace_id, updated_at DESC);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_workflow_templates_workspace ON coding_workflow_templates (workspace_id, updated_at DESC);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow ON coding_workflow_versions (workflow_id, version DESC);")

        # --- SEED DEFAULTS ---
        # 1. Default Admin User: test@gmail.com / test@gmail.com
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
