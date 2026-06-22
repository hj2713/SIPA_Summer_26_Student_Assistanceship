import sqlite3
import requests

import os
import sys

sqlite_db = "data/local_rag.db"
token = os.environ.get("SUPABASE_ACCESS_TOKEN")
if not token:
    print("❌ Error: SUPABASE_ACCESS_TOKEN environment variable not set.")
    print("👉 Run with: SUPABASE_ACCESS_TOKEN=sbp_... python scripts/verify_supabase_migration.py")
    sys.exit(1)

project_ref = "nqgufodcrkzpeikiudga"
url = f"https://api.supabase.com/v1/projects/{project_ref}/database/query"

headers = {
    "Authorization": f"Bearer {token}",
    "User-Agent": "supabase-mcp/2.72.7 (antigravity/1.0)",
    "Content-Type": "application/json"
}

tables = [
    "workspaces",
    "users",
    "dashboards",
    "threads",
    "messages",
    "documents",
    "document_chunks",
    "dashboard_documents",
    "llm_usage_logs"
]

print("🔍 Starting data integrity verification...")

conn = sqlite3.connect(sqlite_db)
cursor = conn.cursor()

mismatches = 0

for table in tables:
    # Get local count
    cursor.execute(f"SELECT COUNT(*) FROM {table};")
    local_count = cursor.fetchone()[0]
    
    # Get remote count
    payload = {
        "query": f"SELECT COUNT(*) FROM {table};",
        "read_only": True
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code in (200, 201):
            remote_count = response.json()[0]["count"]
        else:
            print(f"❌ Error querying remote table '{table}': {response.text}")
            remote_count = "ERROR"
    except Exception as e:
        print(f"❌ Connection error on table '{table}': {e}")
        remote_count = "ERROR"
        
    print(f"📊 Table '{table}':")
    print(f"   - SQLite Row Count: {local_count}")
    print(f"   - Supabase Row Count: {remote_count}")
    
    if remote_count != "ERROR" and int(remote_count) == int(local_count):
        print(f"   ✅ Row counts match perfectly!")
    else:
        print(f"   ❌ ROW COUNT MISMATCH!")
        mismatches += 1

conn.close()

if mismatches == 0:
    print("\n🎉 Verification complete! All table row counts match perfectly between SQLite and Supabase.")
else:
    print(f"\n⚠️ Verification completed with {mismatches} mismatch(es). Please review above logs.")
