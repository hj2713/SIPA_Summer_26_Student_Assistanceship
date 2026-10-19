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

def main():
    with psycopg.connect(settings.DATABASE_URL, prepare_threshold=None, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # Check all dashboards and search for model strings in coded_values
            models = ["kimi", "gpt-oss", "deepseek", "qwen", "gemini-3.5", "gemini-3.1"]
            cur.execute("""
                SELECT d.id, d.name, count(dd.document_id) as total_docs
                FROM dashboards d
                JOIN dashboard_documents dd ON d.id = dd.dashboard_id
                GROUP BY d.id, d.name
            """)
            dashboards = cur.fetchall()
            
            for dash in dashboards:
                d_id = dash["id"]
                d_name = dash["name"]
                
                cur.execute("""
                    SELECT dd.coded_values
                    FROM dashboard_documents dd
                    WHERE dd.dashboard_id = %s AND dd.coded_values IS NOT NULL
                """, (d_id,))
                rows = cur.fetchall()
                if not rows:
                    continue
                
                # Check for models
                counts_by_model = {}
                for r in rows:
                    cv = r["coded_values"]
                    if not cv: continue
                    if isinstance(cv, str):
                        try: cv = json.loads(cv)
                        except: continue
                    if isinstance(cv, dict):
                        for k, v in cv.items():
                            if k not in counts_by_model:
                                counts_by_model[k] = 0
                            if isinstance(v, dict) and (v.get("status") == "completed" or v.get("values")):
                                counts_by_model[k] += 1
                
                if counts_by_model:
                    print(f"\nDashboard {d_id} ('{d_name}') (Total docs: {dash['total_docs']}):")
                    for m, c in counts_by_model.items():
                        if not m.endswith("_history") and not m.endswith("_reasoning"):
                            print(f"  {m}: {c}")

if __name__ == "__main__":
    main()
