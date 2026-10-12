import os
import sys
import json

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(root_dir, "backend")
sys.path.insert(0, backend_dir)
os.chdir(backend_dir)

from app.core.config import settings
import psycopg
from psycopg.rows import dict_row

def inspect():
    db_url = settings.DATABASE_URL
    if not db_url:
        print("DATABASE_URL is empty in settings!")
        return

    print("Connecting to Supabase...")
    try:
        with psycopg.connect(db_url, prepare_threshold=None, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                # 1. Dashboards
                cur.execute("""
                    SELECT d.id, d.name, d.created_at, count(dd.document_id) as doc_count,
                           count(dd.coded_values) as coded_count
                    FROM dashboards d
                    LEFT JOIN dashboard_documents dd ON d.id = dd.dashboard_id
                    GROUP BY d.id, d.name, d.created_at
                    ORDER BY d.created_at DESC
                """)
                dashboards = cur.fetchall()
                print(f"Total dashboards found: {len(dashboards)}")
                for d in dashboards:
                    print(f"Dashboard: {d['id']} | '{d['name']}' | docs: {d['doc_count']} | coded: {d['coded_count']}")

                # 2. Check key dashboards
                target_ids = [
                    "49239894-e7e8-4f0c-877f-2399fc44d0bf",
                    "37a604aa-693e-4945-a89c-5df41b127710",
                    "048ade65-1be5-4d50-ad94-b0051f5a9403",
                ]
                for d_id in target_ids:
                    cur.execute("""
                        SELECT dd.document_id, doc.filename, dd.coded_values
                        FROM dashboard_documents dd
                        JOIN documents doc ON dd.document_id = doc.id
                        WHERE dd.dashboard_id = %s AND dd.coded_values IS NOT NULL
                        LIMIT 5
                    """, (d_id,))
                    sample_rows = cur.fetchall()
                    if sample_rows:
                        print(f"\n--- Samples for dashboard {d_id} ---")
                        for r in sample_rows:
                            val = r["coded_values"]
                            if isinstance(val, str):
                                val = json.loads(val)
                            print(f"  Doc: {r['filename']}, Keys: {list(val.keys()) if isinstance(val, dict) else type(val)}")
                            if isinstance(val, dict):
                                for k, v in list(val.items())[:3]:
                                    print(f"    {k}: {str(v)[:100]}")

    except Exception as e:
        print(f"Database error: {e}")

if __name__ == "__main__":
    inspect()
