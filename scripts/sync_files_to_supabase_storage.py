import os
import sys

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(root_dir, "backend")
sys.path.insert(0, backend_dir)

from app.core.config import settings
from app.services.storage.providers.supabase_provider import SupabaseStorageProvider
import psycopg

def sync_files():
    db_url = settings.DATABASE_URL
    if not db_url:
        print("Error: DATABASE_URL is empty!")
        return

    print("Connecting to Supabase PostgreSQL...")
    conn = psycopg.connect(db_url, prepare_threshold=None)
    conn.autocommit = True
    cur = conn.cursor()

    cur.execute("SELECT id, user_id, filename, file_path FROM documents;")
    documents = cur.fetchall()
    print(f"Syncing {len(documents)} documents to Supabase Storage Bucket...")

    provider = SupabaseStorageProvider()

    # Build filename lookup table
    file_map = {}
    for search_dir in [os.path.join(root_dir, "Updates"), os.path.join(backend_dir, "data", "storage")]:
        if os.path.exists(search_dir):
            for r, _, files in os.walk(search_dir):
                for f in files:
                    if f not in file_map:
                        file_map[f] = os.path.join(r, f)

    uploaded = 0
    already_ok = 0
    missing = 0

    for doc_id, user_id, filename, file_path in documents:
        uid = user_id or "00000000-0000-0000-0000-000000000001"
        base_name = os.path.basename(filename)
        clean_path = f"{uid}/{doc_id}/{base_name}"

        # Update DB file_path to clean_path
        cur.execute("UPDATE documents SET file_path = %s WHERE id = %s;", (clean_path, doc_id))

        try:
            content = provider.download_file(clean_path)
            if content and len(content) > 0:
                already_ok += 1
                continue
        except Exception:
            pass

        found_p = file_map.get(base_name)
        if found_p and os.path.exists(found_p):
            try:
                with open(found_p, "rb") as f:
                    content = f.read()
                provider.upload_file(uid, doc_id, base_name, content, "text/plain")
                uploaded += 1
            except Exception as e:
                print(f"Failed to upload {base_name} to Supabase Storage: {e}")
        else:
            missing += 1
            print(f"Warning: Local file not found for {base_name} (doc_id={doc_id})")

    conn.close()
    print(f"\nSUCCESS: {uploaded} files uploaded to Supabase Storage bucket! ({already_ok} already in bucket, {missing} missing)")

if __name__ == "__main__":
    sync_files()
