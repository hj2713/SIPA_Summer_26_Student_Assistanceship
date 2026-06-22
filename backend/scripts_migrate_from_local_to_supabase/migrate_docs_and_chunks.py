import os
import sys
import sqlite3
import psycopg
from dotenv import load_dotenv

# Ensure we can import from backend app (append backend to sys.path)
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.core.vectors import deserialize_embedding

def main():
    load_dotenv()
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("❌ Error: DATABASE_URL not set in .env")
        sys.exit(1)
        
    sqlite_db = "data/local_rag.db"
    if not os.path.exists(sqlite_db):
        print(f"❌ Error: SQLite DB not found at {sqlite_db}")
        sys.exit(1)
        
    print(f"Connecting to SQLite: {sqlite_db}")
    lite_conn = sqlite3.connect(sqlite_db)
    lite_conn.row_factory = sqlite3.Row
    lite_cur = lite_conn.cursor()
    
    print(f"Connecting to Supabase Postgres...")
    pg_conn = psycopg.connect(db_url, prepare_threshold=None)
    pg_cur = pg_conn.cursor()
    
    # Tables to migrate in order of foreign key dependency (chunks last to avoid blocking others)
    tables_to_migrate = [
        {
            "name": "documents",
            "columns": [
                "id", "user_id", "workspace_id", "filename", "file_path", "file_size",
                "content_type", "status", "error_message", "content_hash", "metadata",
                "created_at", "updated_at"
            ]
        },
        {
            "name": "dashboard_documents",
            "columns": [
                "dashboard_id", "document_id", "coded_values", "status", "error_message",
                "error_type", "current_step", "total_steps", "created_at"
            ]
        },
        {
            "name": "threads",
            "columns": [
                "id", "user_id", "title", "provider", "provider_thread_id", "model",
                "dashboard_id", "created_at", "updated_at"
            ]
        },
        {
            "name": "messages",
            "columns": [
                "id", "thread_id", "user_id", "role", "content",
                "provider_response_id", "tokens_input", "tokens_output", "created_at"
            ]
        },
        {
            "name": "document_chunks",
            "columns": [
                "id", "document_id", "user_id", "workspace_id", "content", "embedding",
                "metadata", "created_at"
            ]
        }
    ]
    
    for table_info in tables_to_migrate:
        table_name = table_info["name"]
        columns = table_info["columns"]
        
        print(f"\n--- Migrating {table_name} ---")
        
        # Check SQLite count
        lite_cur.execute(f"SELECT COUNT(*) FROM {table_name}")
        total_rows = lite_cur.fetchone()[0]
        print(f"Total rows in SQLite for {table_name}: {total_rows}")
        
        if total_rows == 0:
            print(f"No rows to migrate for {table_name}. Skipping.")
            continue
            
        # Select all rows from SQLite
        lite_cur.execute(f"SELECT * FROM {table_name}")
        
        # We will insert in batches
        batch_size = 500 if table_name == "document_chunks" else 100
        
        placeholders = ", ".join(["%s"] * len(columns))
        cols_str = ", ".join(columns)
        insert_query = f"INSERT INTO {table_name} ({cols_str}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"
        
        batch = []
        migrated_count = 0
        
        while True:
            rows = lite_cur.fetchmany(batch_size)
            if not rows:
                break
                
            for row in rows:
                row_data = []
                for col in columns:
                    val = row[col] if col in row.keys() else None
                    
                    # Special processing for workspace_id
                    if col == "workspace_id" and val is None:
                        val = "TEST"
                        
                    # Special processing for vector embedding
                    if col == "embedding" and val is not None:
                        vec = deserialize_embedding(val)
                        if vec:
                            val = "[" + ",".join(str(x) for x in vec) + "]"
                        else:
                            val = None
                            
                    row_data.append(val)
                batch.append(row_data)
                
            if batch:
                pg_cur.executemany(insert_query, batch)
                pg_conn.commit()
                migrated_count += len(batch)
                print(f"Migrated {migrated_count}/{total_rows} rows into {table_name}...")
                batch = []
                
        print(f"✅ Finished migrating {table_name}. Total: {migrated_count} rows.")
        
    lite_conn.close()
    pg_conn.close()
    print("\n🎉 Migration of documents, chunks, dashboard_documents, threads, and messages is complete!")

if __name__ == "__main__":
    main()
