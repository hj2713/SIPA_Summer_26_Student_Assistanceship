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

def inspect_dashboard(dash_id):
    with psycopg.connect(settings.DATABASE_URL, prepare_threshold=None, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name, workflow_definition_json FROM dashboards WHERE id = %s", (dash_id,))
            dash = cur.fetchone()
            print(f"\n==========================================")
            print(f"Dashboard: {dash_id} ('{dash['name'] if dash else 'None'}')")
            print(f"Has workflow definition: {dash['workflow_definition_json'] is not None if dash else False}")
            
            cur.execute("""
                SELECT dd.document_id, doc.filename, dd.status, dd.coded_values
                FROM dashboard_documents dd
                JOIN documents doc ON dd.document_id = doc.id
                WHERE dd.dashboard_id = %s
            """, (dash_id,))
            rows = cur.fetchall()
            print(f"Total documents: {len(rows)}")
            
            model_counts = {}
            model_statuses = {}
            for r in rows:
                cv = r['coded_values']
                if not cv:
                    continue
                if isinstance(cv, str):
                    try:
                        cv = json.loads(cv)
                    except:
                        continue
                if not isinstance(cv, dict):
                    continue
                
                # Check top-level keys
                for k, v in cv.items():
                    if isinstance(v, dict) and ("values" in v or "status" in v):
                        m_name = k
                        st = v.get("status", "unknown")
                        vals = v.get("values", {})
                        has_vals = len(vals) > 0
                    else:
                        m_name = "FLAT"
                        st = "completed"
                        has_vals = True
                    
                    if m_name not in model_counts:
                        model_counts[m_name] = {"total": 0, "completed": 0, "failed": 0, "processing": 0, "has_vals": 0}
                    model_counts[m_name]["total"] += 1
                    if st in model_counts[m_name]:
                        model_counts[m_name][st] += 1
                    if has_vals:
                        model_counts[m_name]["has_vals"] += 1

            print("Model summary:")
            for m, counts in model_counts.items():
                print(f"  Model: {m} -> {counts}")

            # Also check sample coded_values from one row
            for r in rows:
                if r['coded_values']:
                    cv = r['coded_values']
                    if isinstance(cv, str): cv = json.loads(cv)
                    print("\nSample top-level keys in coded_values:", list(cv.keys())[:10])
                    break

def main():
    for d_id in ["37a604aa-693e-4945-a89c-5df41b127710", "c45796b6-18b5-46ad-a805-4066fec7feaf", "048ade65-1be5-4d50-ad94-b0051f5a9403", "e1fcbf47-f255-483e-b467-4be32275dd5e"]:
        inspect_dashboard(d_id)

if __name__ == "__main__":
    main()
