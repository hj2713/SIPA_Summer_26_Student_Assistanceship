import os
import sys
import sqlite3
import json
import requests
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

# Ensure we can import from backend app (append backend to sys.path)
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.vectors import deserialize_embedding

DB_PATH = "data/local_rag.db"
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN")
if not TOKEN:
    print("❌ Error: SUPABASE_ACCESS_TOKEN environment variable not set.")
    print("👉 Run with: SUPABASE_ACCESS_TOKEN=sbp_... python scripts/migrate_to_supabase.py")
    sys.exit(1)

PROJECT_REF = "nqgufodcrkzpeikiudga"
URL = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "User-Agent": "supabase-mcp/2.72.7 (antigravity/1.0)",
    "Content-Type": "application/json"
}

def run_query(sql: str, read_only: bool = False, max_retries: int = 12):
    """Helper to run raw SQL on the remote Supabase DB using the Management API with retry backoff."""
    payload = {
        "query": sql,
        "read_only": read_only
    }
    
    backoff = 2.0
    for attempt in range(max_retries):
        try:
            response = requests.post(URL, json=payload, headers=HEADERS, timeout=60.0)
            if response.status_code in (200, 201):
                return response.json()
            
            # Retry on rate limit (429) or server-side gateway errors (502, 503, 504)
            if response.status_code in (429, 502, 503, 504):
                print(f"⚠️ Warning: HTTP {response.status_code} on attempt {attempt+1}/{max_retries}. Retrying in {backoff:.1f}s...")
                time.sleep(backoff)
                backoff *= 2.0
                continue
                
            raise RuntimeError(f"API Error {response.status_code}: {response.text}\nQuery was:\n{sql[:500]}...")
            
        except (requests.RequestException, ConnectionError) as e:
            print(f"⚠️ Warning: Connection error '{e}' on attempt {attempt+1}/{max_retries}. Retrying in {backoff:.1f}s...")
            time.sleep(backoff)
            backoff *= 2.0
            
    # Final direct attempt
    response = requests.post(URL, json=payload, headers=HEADERS, timeout=60.0)
    if response.status_code not in (200, 201):
        raise RuntimeError(f"API Error {response.status_code}: {response.text}\nQuery was:\n{sql[:500]}...")
    return response.json()

def escape_value(val, col_name=None):
    if val is None:
        return "NULL"
    if isinstance(val, (int, float)):
        return str(val)
    if col_name == "embedding":
        vector = deserialize_embedding(val)
        if not vector:
            return "NULL"
        vector_str = "[" + ",".join(str(x) for x in vector) + "]"
        return f"cast('{vector_str}' as vector)"
    
    # Handle string escaping for SQL (double up single quotes)
    escaped = str(val).replace("'", "''")
    return f"'{escaped}'"

# Postgres DDL matching database.py
DDL_STATEMENTS = [
    # Drop existing tables cascade
    "DROP TABLE IF EXISTS llm_usage_logs, dashboard_documents, document_chunks, documents, messages, threads, dashboards, users, workspaces CASCADE;",
    
    # Vector extension
    "CREATE EXTENSION IF NOT EXISTS vector;",
    
    # workspaces
    """
    CREATE TABLE workspaces (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    """,
    
    # users
    """
    CREATE TABLE users (
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
    """,
    
    # dashboards
    """
    CREATE TABLE dashboards (
        id VARCHAR(255) PRIMARY KEY,
        workspace_id VARCHAR(255) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        prompt TEXT NOT NULL,
        schema TEXT NOT NULL DEFAULT '[]',
        model VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    """,
    
    # threads
    """
    CREATE TABLE threads (
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
    """,
    
    # messages
    """
    CREATE TABLE messages (
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
    """,
    
    # documents
    """
    CREATE TABLE documents (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        workspace_id VARCHAR(255) DEFAULT 'TEST' REFERENCES workspaces(id) ON DELETE CASCADE,
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
    """,
    
    # document_chunks
    """
    CREATE TABLE document_chunks (
        id VARCHAR(255) PRIMARY KEY,
        document_id VARCHAR(255) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        workspace_id VARCHAR(255) DEFAULT 'TEST' REFERENCES workspaces(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        embedding vector,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    """,
    
    # dashboard_documents
    """
    CREATE TABLE dashboard_documents (
        dashboard_id VARCHAR(255) NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
        document_id VARCHAR(255) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        coded_values TEXT NOT NULL DEFAULT '{}',
        status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
        error_message TEXT,
        error_type VARCHAR(50) CHECK(error_type IN ('API_FAILURE', 'COMPREHENSION_FAILURE', 'EXTRACTION_FAILURE')),
        current_step INTEGER DEFAULT 0,
        total_steps INTEGER DEFAULT 7,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (dashboard_id, document_id)
    );
    """,
    
    # llm_usage_logs
    """
    CREATE TABLE llm_usage_logs (
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
    """,
    
    # Indexes
    "CREATE INDEX IF NOT EXISTS idx_threads_user_updated ON threads (user_id, updated_at DESC);",
    "CREATE INDEX IF NOT EXISTS idx_messages_thread_created ON messages (thread_id, created_at ASC);",
    "CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON document_chunks (document_id);",
    "CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents (user_id);",
    "CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents (workspace_id);",
    "CREATE INDEX IF NOT EXISTS idx_chunks_workspace ON document_chunks (workspace_id);",
    "CREATE INDEX IF NOT EXISTS idx_dashboards_workspace ON dashboards (workspace_id);",
    "CREATE INDEX IF NOT EXISTS idx_dash_docs_dashboard ON dashboard_documents (dashboard_id);",
    "CREATE INDEX IF NOT EXISTS idx_dash_docs_document ON dashboard_documents (document_id);"
]

# Explicit SQLite-to-Postgres column mapping definition
TABLE_COLUMNS = {
    "workspaces": ["id", "name", "created_at"],
    "users": [
        "id", "email", "password_hash", "is_admin", "can_add", "can_delete",
        "llm_provider", "llm_api_key_encrypted", "llm_model", "llm_base_url", "created_at"
    ],
    "dashboards": [
        "id", "workspace_id", "name", "description", "prompt", "schema", "model", "created_at"
    ],
    "threads": [
        "id", "user_id", "title", "provider", "provider_thread_id", "model", "dashboard_id", "created_at", "updated_at"
    ],
    "messages": [
        "id", "thread_id", "user_id", "role", "content", "provider_response_id", "tokens_input", "tokens_output", "created_at"
    ],
    "documents": [
        "id", "user_id", "workspace_id", "filename", "file_path", "file_size", "content_type",
        "status", "error_message", "content_hash", "metadata", "created_at", "updated_at"
    ],
    "document_chunks": [
        "id", "document_id", "user_id", "workspace_id", "content", "embedding", "metadata", "created_at"
    ],
    "dashboard_documents": [
        "dashboard_id", "document_id", "coded_values", "status", "error_message", "error_type", "current_step", "total_steps", "created_at"
    ],
    "llm_usage_logs": [
        "id", "timestamp", "provider", "model", "service", "campaign_id", "thread_id", "input_tokens", "output_tokens", "calculated_cost"
    ]
}

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"❌ Local SQLite database not found at {DB_PATH}")
        sys.exit(1)
        
    print(f"👉 Connecting to SQLite database: {DB_PATH}")
    sqlite_conn = sqlite3.connect(DB_PATH)
    sqlite_conn.row_factory = sqlite3.Row
    sqlite_cursor = sqlite_conn.cursor()
    
    # 1. Recreate Remote Schema
    print("👉 Resetting and recreating Supabase schema...")
    for ddl in DDL_STATEMENTS:
        run_query(ddl)
    print("✅ Remote database tables and indexes created successfully.")
    
    # 2. Migrate tables sequentially, using parallel workers for larger data tables (document_chunks)
    for table_name, columns in TABLE_COLUMNS.items():
        print(f"👉 Migrating table '{table_name}'...")
        
        # Count local rows
        sqlite_cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
        local_count = sqlite_cursor.fetchone()[0]
        print(f"   - Local rows to migrate: {local_count}")
        
        if local_count == 0:
            print(f"   - Table '{table_name}' is empty. Skipping.")
            continue
            
        # Select all local rows
        sqlite_cursor.execute(f"SELECT * FROM {table_name}")
        rows = sqlite_cursor.fetchall()
        
        # Determine batching and worker settings
        is_parallel = (table_name == "document_chunks")
        batch_size = 100 if is_parallel else 200
        
        # Construct value groups
        batches = []
        current_batch = []
        for row in rows:
            mapped_vals = []
            for col in columns:
                val = row[col] if col in row.keys() else None
                if col == "workspace_id" and val is None:
                    val = "TEST"
                mapped_vals.append(escape_value(val, col_name=col))
            current_batch.append("(" + ", ".join(mapped_vals) + ")")
            if len(current_batch) == batch_size:
                batches.append(current_batch)
                current_batch = []
        if current_batch:
            batches.append(current_batch)
            
        print(f"   - Prepared {len(batches)} batches of size {batch_size}.")
        
        if is_parallel:
            max_workers = 4
            completed = 0
            print(f"   - Running batch upload concurrently using {max_workers} threads...")
            
            def upload_batch(batch_idx, batch_values):
                cols_str = ", ".join(columns)
                vals_str = ", ".join(batch_values)
                sql_insert = f"INSERT INTO {table_name} ({cols_str}) VALUES {vals_str};"
                run_query(sql_insert)
                
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = {executor.submit(upload_batch, idx, batch): idx for idx, batch in enumerate(batches)}
                for future in as_completed(futures):
                    idx = futures[future]
                    try:
                        future.result()
                        completed += 1
                        if completed % 10 == 0 or completed == len(batches):
                            rows_done = min(completed * batch_size, local_count)
                            print(f"   - Progress: {rows_done}/{local_count} rows migrated ({completed}/{len(batches)} batches).")
                    except Exception as e:
                        print(f"❌ Error inserting batch {idx} for table '{table_name}': {e}")
                        executor.shutdown(wait=False)
                        sys.exit(1)
        else:
            # Sequential migration for small tables
            for idx, batch in enumerate(batches):
                cols_str = ", ".join(columns)
                vals_str = ", ".join(batch)
                sql_insert = f"INSERT INTO {table_name} ({cols_str}) VALUES {vals_str};"
                try:
                    run_query(sql_insert)
                except Exception as e:
                    print(f"❌ Error inserting batch for table '{table_name}': {e}")
                    sys.exit(1)
                
                rows_done = min((idx + 1) * batch_size, local_count)
                print(f"   - Progress: {rows_done}/{local_count} rows migrated.")
                time.sleep(0.02)
                
        print(f"✅ Table '{table_name}' migrated successfully ({local_count} rows).")
        
    sqlite_conn.close()
    print("🎉 SQLite to Supabase Migration completed successfully!")

if __name__ == "__main__":
    migrate()
