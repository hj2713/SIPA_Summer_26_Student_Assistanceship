import os
import sys

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(root_dir, "backend")
sys.path.insert(0, backend_dir)

from app.core.config import settings
from app.services.document_service import document_service
import psycopg

def populate_and_normalize_storage():
    db_url = settings.DATABASE_URL
    if not db_url:
        print("Error: DATABASE_URL is empty!")
        return

    print("Connecting to Supabase PostgreSQL...")
    conn = psycopg.connect(db_url, prepare_threshold=None)
    cur = conn.cursor()

    cur.execute("SELECT id, user_id, filename, file_path FROM documents;")
    documents = cur.fetchall()
    print(f"Normalizing and populating storage for {len(documents)} documents...")

    # Build filename lookup table across Updates/ directory
    file_map = {}
    updates_dir = os.path.join(root_dir, "Updates")
    if os.path.exists(updates_dir):
        for root, _, files in os.walk(updates_dir):
            for f in files:
                if f.endswith(".txt") or f.endswith(".pdf") or f.endswith(".csv") or f.endswith(".docx"):
                    file_map[f] = os.path.join(root, f)

    updated_paths = 0
    restored = 0
    already_ok = 0
    missing = 0

    for doc_id, user_id, filename, file_path in documents:
        uid = user_id or "00000000-0000-0000-0000-000000000001"
        base_name = os.path.basename(filename)
        clean_path = f"{uid}/{doc_id}/{base_name}"

        if file_path != clean_path:
            cur.execute("UPDATE documents SET file_path = %s WHERE id = %s;", (clean_path, doc_id))
            updated_paths += 1

        try:
            content = document_service.download_file_from_storage(None, clean_path)
            if content and len(content) > 0:
                already_ok += 1
                continue
        except Exception:
            pass

        found_local = file_map.get(base_name)
        if found_local and os.path.exists(found_local):
            with open(found_local, "rb") as f:
                content = f.read()

            try:
                document_service.upload_file_to_storage(
                    None,
                    uid,
                    doc_id,
                    base_name,
                    content,
                    "text/plain"
                )
                restored += 1
            except Exception as e:
                print(f"Error uploading {base_name}: {e}")
        else:
            missing += 1
            print(f"Warning: Could not find local file for doc_id={doc_id}, filename={filename}")

    conn.commit()
    conn.close()
    print(f"\nRESULT: {updated_paths} database paths normalized, {already_ok} already in storage, {restored} restored, {missing} missing.")

if __name__ == "__main__":
    populate_and_normalize_storage()
