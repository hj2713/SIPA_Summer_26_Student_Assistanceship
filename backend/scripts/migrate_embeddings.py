import os
import sys
import sqlite3
import json
import time

# Ensure we can import from backend app (append backend to sys.path)
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.vectors import quantize_to_int8

DB_PATH = "backend/data/local_rag.db"

def get_file_size_mb(path: str) -> float:
    if not os.path.exists(path):
        return 0.0
    return os.path.getsize(path) / (1024 * 1024)

def run_migration():
    if not os.path.exists(DB_PATH):
        print(f"❌ Database not found at: {DB_PATH}")
        sys.exit(1)

    initial_size = get_file_size_mb(DB_PATH)
    print(f"👉 Initial database size: {initial_size:.2f} MB")
    print("👉 Starting embedding migration...")

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = OFF;") # Speed up updates and prevent triggers
    cursor = conn.cursor()

    # 1. Fetch chunks to migrate
    print("👉 Scanning document_chunks...")
    cursor.execute("SELECT id, embedding FROM document_chunks;")
    rows = cursor.fetchall()
    
    total_chunks = len(rows)
    migrated_count = 0
    skipped_count = 0
    error_count = 0
    
    print(f"👉 Found {total_chunks} total chunks in database.")
    
    start_time = time.time()
    
    # 2. Iterate and update in batches
    batch_size = 2000
    conn.execute("BEGIN TRANSACTION;")
    
    for i, (chunk_id, embedding_val) in enumerate(rows):
        # Determine if it's already binary/BLOB or empty
        if not embedding_val:
            skipped_count += 1
            continue
            
        is_json_str = False
        vector = None
        
        if isinstance(embedding_val, bytes):
            # Already binary (either previously migrated or empty BLOB)
            skipped_count += 1
            continue
        elif isinstance(embedding_val, str):
            embedding_val = embedding_val.strip()
            if embedding_val.startswith("["):
                is_json_str = True
                try:
                    vector = json.loads(embedding_val)
                except Exception:
                    pass
        
        if is_json_str and vector:
            try:
                # Quantize vector (list of floats) to bytes
                binary_val = quantize_to_int8(vector)
                # Update database
                cursor.execute(
                    "UPDATE document_chunks SET embedding = ? WHERE id = ?;",
                    (sqlite3.Binary(binary_val), chunk_id)
                )
                migrated_count += 1
            except Exception as e:
                print(f"❌ Error migrating chunk {chunk_id}: {e}")
                error_count += 1
        else:
            skipped_count += 1

        # Commit batch
        if (i + 1) % batch_size == 0:
            conn.commit()
            print(f"   Processed {i + 1}/{total_chunks} chunks (Migrated: {migrated_count}, Skipped: {skipped_count})...")
            conn.execute("BEGIN TRANSACTION;")

    conn.commit()
    
    # Re-enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON;")
    
    duration = time.time() - start_time
    print(f"✅ Migration completed in {duration:.2f} seconds.")
    print(f"   - Total chunks scanned: {total_chunks}")
    print(f"   - Migrated from JSON to Int8 BLOB: {migrated_count}")
    print(f"   - Skipped (already binary/empty): {skipped_count}")
    print(f"   - Errors: {error_count}")

    # 3. Perform SQLite VACUUM to reclaim space
    if migrated_count > 0:
        print("👉 Running VACUUM to reclaim free pages and shrink physical database file on disk...")
        vacuum_start = time.time()
        conn.execute("VACUUM;")
        vacuum_duration = time.time() - vacuum_start
        print(f"✅ VACUUM completed in {vacuum_duration:.2f} seconds.")
    
    conn.close()

    final_size = get_file_size_mb(DB_PATH)
    reduction = initial_size - final_size
    percent = (reduction / initial_size) * 100 if initial_size > 0 else 0
    print(f"🎉 Final database size: {final_size:.2f} MB")
    print(f"🎉 Reclaimed Space: {reduction:.2f} MB ({percent:.2f}% reduction)")

if __name__ == "__main__":
    run_migration()
