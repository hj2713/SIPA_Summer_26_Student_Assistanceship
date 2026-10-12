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

def run():
    db_url = settings.DATABASE_URL
    with psycopg.connect(db_url, prepare_threshold=None, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # Check dashboard 37a604aa-693e-4945-a89c-5df41b127710
            dash_id = "37a604aa-693e-4945-a89c-5df41b127710"
            cur.execute("""
                SELECT doc.filename, dd.coded_values
                FROM dashboard_documents dd
                JOIN documents doc ON dd.document_id = doc.id
                WHERE dd.dashboard_id = %s
            """, (dash_id,))
            rows = cur.fetchall()
            print(f"Total rows in {dash_id}: {len(rows)}")
            
            model_keys = set()
            model_completed_counts = {}
            sample_values_by_model = {}

            for r in rows:
                coded = r["coded_values"]
                if not coded:
                    continue
                if isinstance(coded, str):
                    coded = json.loads(coded)
                if isinstance(coded, dict):
                    for m, m_data in coded.items():
                        model_keys.add(m)
                        if m not in model_completed_counts:
                            model_completed_counts[m] = 0
                        if isinstance(m_data, dict):
                            vals = m_data.get("values", {})
                            status = m_data.get("status")
                            if status == "completed" or (vals and len(vals) > 0):
                                model_completed_counts[m] += 1
                            if m not in sample_values_by_model and vals:
                                sample_values_by_model[m] = vals

            print("\nModel keys found in dashboard:", list(model_keys))
            print("Completed / populated counts per model:")
            for m, count in model_completed_counts.items():
                print(f"  {m}: {count} / {len(rows)}")

            print("\nSample fields per model:")
            for m, vals in sample_values_by_model.items():
                print(f"\nModel: {m}")
                print(f"  Fields: {list(vals.keys())}")
                for f in ["cascade_discretion_rank", "m9_discretion_rank", "b3_discretion_rank", "delegate_law", "scope_breadth", "constraint_strength"]:
                    if f in vals:
                        print(f"    {f} = {vals[f]}")

            # Check if there are other dashboards with coded_values containing discretion_rank
            print("\n--- Checking all other dashboards for discretion rank fields ---")
            cur.execute("""
                SELECT dd.dashboard_id, d.name, count(*) as count
                FROM dashboard_documents dd
                JOIN dashboards d ON dd.dashboard_id = d.id
                WHERE dd.coded_values::text LIKE '%discretion_rank%'
                GROUP BY dd.dashboard_id, d.name
            """)
            other_dash = cur.fetchall()
            for od in other_dash:
                print(f"Dashboard {od['dashboard_id']} ('{od['name']}'): {od['count']} docs with discretion_rank")

if __name__ == "__main__":
    run()
