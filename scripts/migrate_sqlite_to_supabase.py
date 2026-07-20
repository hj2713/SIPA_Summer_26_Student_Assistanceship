import os
import sys
import sqlite3
import json

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(root_dir, "backend")
sys.path.insert(0, backend_dir)

from app.core.config import settings
import psycopg

def migrate():
    db_url = settings.DATABASE_URL
    if not db_url:
        print("Error: DATABASE_URL is empty!")
        return

    print("Connecting to Supabase PostgreSQL database...")
    pg_conn = psycopg.connect(db_url, prepare_threshold=None)
    pg_conn.autocommit = False
    pg_cur = pg_conn.cursor()

    print("Ensuring Supabase PostgreSQL tables exist...")
    pg_cur.execute("""
        CREATE TABLE IF NOT EXISTS workspaces (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) UNIQUE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    """)

    pg_cur.execute("""
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

    pg_cur.execute("""
        CREATE TABLE IF NOT EXISTS dashboards (
            id VARCHAR(255) PRIMARY KEY,
            workspace_id VARCHAR(255) NOT NULL DEFAULT 'PRODUCTION' REFERENCES workspaces(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            prompt TEXT,
            schema JSONB NOT NULL,
            model VARCHAR(255),
            dashboard_type VARCHAR(50) NOT NULL DEFAULT 'campaign',
            workflow_source VARCHAR(255),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    """)

    pg_cur.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id VARCHAR(255) PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            workspace_id VARCHAR(255) NOT NULL DEFAULT 'PRODUCTION' REFERENCES workspaces(id) ON DELETE CASCADE,
            filename VARCHAR(255) NOT NULL,
            file_path TEXT NOT NULL,
            file_size BIGINT NOT NULL,
            content_type VARCHAR(100) NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'completed',
            error_message TEXT,
            content_hash VARCHAR(64),
            metadata JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (workspace_id, filename)
        );
    """)

    pg_cur.execute("""
        CREATE TABLE IF NOT EXISTS dashboard_documents (
            dashboard_id VARCHAR(255) REFERENCES dashboards(id) ON DELETE CASCADE,
            document_id VARCHAR(255) REFERENCES documents(id) ON DELETE CASCADE,
            coded_values JSONB DEFAULT '{}'::jsonb,
            status VARCHAR(50) NOT NULL DEFAULT 'pending',
            error_message TEXT,
            trace JSONB DEFAULT '{}'::jsonb,
            evaluation_cost DOUBLE PRECISION DEFAULT 0.0,
            token_usage JSONB DEFAULT '{}'::jsonb,
            PRIMARY KEY (dashboard_id, document_id)
        );
    """)
    pg_conn.commit()
    print("Supabase database tables verified and committed!\n")

    # Always ensure system default workspace and user exist first
    pg_cur.execute("INSERT INTO workspaces (id, name) VALUES ('PRODUCTION', 'PRODUCTION') ON CONFLICT (id) DO NOTHING;")
    pg_cur.execute("INSERT INTO workspaces (id, name) VALUES ('QA', 'QA') ON CONFLICT (id) DO NOTHING;")
    pg_cur.execute("""
        INSERT INTO users (id, email, password_hash, is_admin, can_add, can_delete)
        VALUES ('00000000-0000-0000-0000-000000000001', 'test@test.com', 'hash', 1, 1, 1)
        ON CONFLICT (id) DO NOTHING;
    """)
    pg_conn.commit()

    sqlite_paths = [
        os.path.join(root_dir, "data", "local_rag.db"),
        os.path.join(backend_dir, "data", "local_rag.db"),
    ]

    for sqlite_path in sqlite_paths:
        if not os.path.exists(sqlite_path):
            print(f"Skipping non-existent SQLite db: {sqlite_path}")
            continue

        print(f"Migrating data from local SQLite: {sqlite_path}")
        sq_conn = sqlite3.connect(sqlite_path)
        sq_conn.row_factory = sqlite3.Row
        sq_cur = sq_conn.cursor()

        # 1. Workspaces
        sq_cur.execute("SELECT id, name FROM workspaces;")
        w_count = 0
        for r in sq_cur.fetchall():
            try:
                pg_cur.execute("INSERT INTO workspaces (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING;", (r["id"], r["name"]))
                pg_conn.commit()
                w_count += 1
            except Exception:
                pg_conn.rollback()
        print(f"  ✓ Workspaces migrated ({w_count} rows)")

        # 2. Users
        sq_cur.execute("SELECT id, email, password_hash, is_admin, can_add, can_delete FROM users;")
        u_count = 0
        for r in sq_cur.fetchall():
            try:
                pg_cur.execute("""
                    INSERT INTO users (id, email, password_hash, is_admin, can_add, can_delete)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email;
                """, (r["id"], r["email"], r["password_hash"], r["is_admin"], r["can_add"], r["can_delete"]))
                pg_conn.commit()
                u_count += 1
            except Exception:
                pg_conn.rollback()
        print(f"  ✓ Users migrated ({u_count} rows)")

        # 3. Dashboards
        sq_cur.execute("SELECT * FROM dashboards;")
        db_count = 0
        for row in sq_cur.fetchall():
            r = dict(row)
            try:
                pg_cur.execute("""
                    INSERT INTO dashboards (id, workspace_id, name, description, prompt, schema, model, dashboard_type)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        schema = EXCLUDED.schema,
                        model = EXCLUDED.model;
                """, (
                    r["id"], r.get("workspace_id", "PRODUCTION"),
                    r.get("name", ""), r.get("description", ""), r.get("prompt", ""),
                    r.get("schema", "[]"), r.get("model", ""),
                    r.get("dashboard_type", "campaign")
                ))
                pg_conn.commit()
                db_count += 1
            except Exception as e:
                pg_conn.rollback()
                print(f"    Dashboard item error: {e}")
        print(f"  ✓ Dashboards migrated ({db_count} rows)")

        # 4. Documents
        sq_cur.execute("SELECT * FROM documents;")
        doc_count = 0
        for row in sq_cur.fetchall():
            r = dict(row)
            try:
                pg_cur.execute("""
                    INSERT INTO documents (id, user_id, workspace_id, filename, file_path, file_size, content_type, status, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING;
                """, (
                    r["id"], r["user_id"], r.get("workspace_id", "PRODUCTION"),
                    r.get("filename", "law.txt"), r.get("file_path", ""), r.get("file_size", 100),
                    r.get("content_type", "text/plain"), r.get("status", "completed"),
                    r.get("metadata", "{}")
                ))
                pg_conn.commit()
                doc_count += 1
            except Exception as e:
                pg_conn.rollback()
                print(f"    Document item error: {e}")
        print(f"  ✓ Documents migrated ({doc_count} rows)")

        # 5. Dashboard Documents
        sq_cur.execute("SELECT * FROM dashboard_documents;")
        dd_count = 0
        for row in sq_cur.fetchall():
            r = dict(row)
            try:
                pg_cur.execute("""
                    INSERT INTO dashboard_documents (dashboard_id, document_id, coded_values, status)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (dashboard_id, document_id) DO UPDATE SET
                        status = EXCLUDED.status,
                        coded_values = EXCLUDED.coded_values;
                """, (
                    r["dashboard_id"], r["document_id"],
                    r.get("coded_values", "{}"), r.get("status", "pending")
                ))
                pg_conn.commit()
                dd_count += 1
            except Exception as e:
                pg_conn.rollback()
                print(f"    Dashboard document item error: {e}")
        print(f"  ✓ Dashboard documents migrated ({dd_count} rows)")

        sq_conn.close()

    pg_conn.close()
    print("\nSUCCESS: All local SQLite databases migrated and committed to Supabase PostgreSQL successfully!")

if __name__ == "__main__":
    migrate()
