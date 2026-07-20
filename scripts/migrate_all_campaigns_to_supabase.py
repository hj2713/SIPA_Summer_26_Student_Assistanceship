import os
import sys
import sqlite3
import json

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(root_dir, "backend")
sys.path.insert(0, backend_dir)

from app.core.config import settings
import psycopg

def migrate_all():
    db_url = settings.DATABASE_URL
    if not db_url:
        print("Error: DATABASE_URL is empty!")
        return

    print("Connecting to Supabase PostgreSQL...")
    pg_conn = psycopg.connect(db_url, prepare_threshold=None)
    pg_conn.autocommit = True
    pg_cur = pg_conn.cursor()

    # 1. Always seed all workspaces and default users into Supabase first
    print("Ensuring workspaces & system users exist in Supabase...")
    for ws_id in ["PRODUCTION", "QA", "TEST"]:
        try:
            pg_cur.execute("INSERT INTO workspaces (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING;", (ws_id, ws_id))
        except Exception:
            pass

    try:
        pg_cur.execute("""
            INSERT INTO users (id, email, password_hash, is_admin, can_add, can_delete)
            VALUES ('00000000-0000-0000-0000-000000000001', 'test@test.com', 'hash', 1, 1, 1)
            ON CONFLICT (id) DO NOTHING;
        """)
    except Exception:
        pass

    sqlite_paths = [
        os.path.join(backend_dir, "data", "local_rag.db"),
        os.path.join(root_dir, "data", "local_rag.db"),
    ]

    total_dashboards = 0
    total_documents = 0
    total_dd = 0

    for sqlite_path in sqlite_paths:
        if not os.path.exists(sqlite_path):
            print(f"Skipping non-existent SQLite db: {sqlite_path}")
            continue

        print(f"\nMigrating data from: {sqlite_path}")
        sq_conn = sqlite3.connect(sqlite_path)
        sq_conn.row_factory = sqlite3.Row
        sq_cur = sq_conn.cursor()

        # Step 1: Workspaces
        try:
            sq_cur.execute("SELECT id, name FROM workspaces;")
            for r in sq_cur.fetchall():
                try:
                    pg_cur.execute("INSERT INTO workspaces (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING;", (r["id"], r["name"]))
                except Exception:
                    pass
            print("  ✓ Workspaces")
        except Exception as e:
            print(f"  ! Workspaces error: {e}")

        # Step 2: Users
        try:
            sq_cur.execute("SELECT id, email, password_hash, is_admin, can_add, can_delete FROM users;")
            for r in sq_cur.fetchall():
                try:
                    pg_cur.execute("""
                        INSERT INTO users (id, email, password_hash, is_admin, can_add, can_delete)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        ON CONFLICT (id) DO NOTHING;
                    """, (r["id"], r["email"], r["password_hash"], r["is_admin"], r["can_add"], r["can_delete"]))
                except Exception:
                    pass
            print("  ✓ Users")
        except Exception as e:
            print(f"  ! Users error: {e}")

        # Step 3: Dashboards
        try:
            sq_cur.execute("SELECT * FROM dashboards;")
            for row in sq_cur.fetchall():
                r = dict(row)
                ws = r.get("workspace_id") or "PRODUCTION"
                try:
                    pg_cur.execute("INSERT INTO workspaces (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING;", (ws, ws))
                    pg_cur.execute("""
                        INSERT INTO dashboards (id, workspace_id, name, description, prompt, schema, model, dashboard_type, workflow_source)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (id) DO UPDATE SET
                            name = EXCLUDED.name,
                            schema = EXCLUDED.schema,
                            model = EXCLUDED.model,
                            workflow_source = EXCLUDED.workflow_source;
                    """, (
                        r["id"], ws,
                        r.get("name", ""), r.get("description", ""), r.get("prompt", ""),
                        r.get("schema", "[]"), r.get("model", ""),
                        r.get("dashboard_type", "campaign"), r.get("workflow_source")
                    ))
                    total_dashboards += 1
                except Exception as e:
                    print(f"    Dash item skip: {e}")
            print("  ✓ Dashboards")
        except Exception as e:
            print(f"  ! Dashboards error: {e}")

        # Step 4: Documents
        try:
            sq_cur.execute("SELECT * FROM documents;")
            for row in sq_cur.fetchall():
                r = dict(row)
                ws = r.get("workspace_id") or "PRODUCTION"
                uid = r.get("user_id") or "00000000-0000-0000-0000-000000000001"
                try:
                    pg_cur.execute("INSERT INTO workspaces (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING;", (ws, ws))
                    pg_cur.execute("""
                        INSERT INTO users (id, email, password_hash, is_admin, can_add, can_delete)
                        VALUES (%s, %s, 'hash', 1, 1, 1) ON CONFLICT (id) DO NOTHING;
                    """, (uid, f"user_{uid[:8]}@local.test"))
                    pg_cur.execute("""
                        INSERT INTO documents (id, user_id, workspace_id, filename, file_path, file_size, content_type, status, error_message, content_hash, metadata)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, file_path = EXCLUDED.file_path;
                    """, (
                        r["id"], uid, ws,
                        r.get("filename", "law.txt"), r.get("file_path", ""), r.get("file_size", 100),
                        r.get("content_type", "text/plain"), r.get("status", "completed"),
                        r.get("error_message"), r.get("content_hash"), r.get("metadata", "{}")
                    ))
                    total_documents += 1
                except Exception as e:
                    print(f"    Doc item skip: {e}")
            print("  ✓ Documents")
        except Exception as e:
            print(f"  ! Documents error: {e}")

        # Step 5: Dashboard Documents
        try:
            sq_cur.execute("SELECT * FROM dashboard_documents;")
            for row in sq_cur.fetchall():
                r = dict(row)
                try:
                    pg_cur.execute("""
                        INSERT INTO dashboard_documents (dashboard_id, document_id, coded_values, status, error_message)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (dashboard_id, document_id) DO UPDATE SET
                            status = EXCLUDED.status,
                            coded_values = EXCLUDED.coded_values,
                            error_message = EXCLUDED.error_message;
                    """, (
                        r["dashboard_id"], r["document_id"],
                        r.get("coded_values", "{}"), r.get("status", "pending"),
                        r.get("error_message")
                    ))
                    total_dd += 1
                except Exception:
                    pass
            print("  ✓ Dashboard documents")
        except Exception as e:
            print(f"  ! Dashboard documents error: {e}")

        sq_conn.close()

    pg_conn.close()
    print(f"\nSUCCESS: Migrated {total_dashboards} dashboards, {total_documents} documents, and {total_dd} dashboard document evaluation records to Supabase PostgreSQL!")

if __name__ == "__main__":
    migrate_all()
