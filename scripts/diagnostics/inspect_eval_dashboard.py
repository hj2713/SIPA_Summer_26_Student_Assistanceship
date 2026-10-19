import os
import sys
import json
from collections import Counter

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(root_dir, "backend")
sys.path.insert(0, backend_dir)
os.chdir(backend_dir)

from app.core.config import settings
import psycopg
from psycopg.rows import dict_row

def main():
    dash_id = "37a604aa-693e-4945-a89c-5df41b127710"
    with psycopg.connect(settings.DATABASE_URL, prepare_threshold=None, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT dd.document_id, doc.filename, dd.status, dd.coded_values
                FROM dashboard_documents dd
                JOIN documents doc ON dd.document_id = doc.id
                WHERE dd.dashboard_id = %s
                ORDER BY doc.filename
            """, (dash_id,))
            rows = cur.fetchall()
            print(f"Total rows in {dash_id}: {len(rows)}")

            doc_statuses = Counter()
            model_statuses = {} # model -> Counter(status)
            model_fields = {}   # model -> set of fields
            single_pass_found = {} # model -> count

            null_or_empty_cv = 0
            for r in rows:
                doc_statuses[r["status"]] += 1
                cv = r["coded_values"]
                if not cv or cv == {} or cv == "{}":
                    null_or_empty_cv += 1
                    continue
                if isinstance(cv, str):
                    cv = json.loads(cv)

                for m_name, m_data in cv.items():
                    if m_name not in model_statuses:
                        model_statuses[m_name] = Counter()
                        model_fields[m_name] = set()
                        single_pass_found[m_name] = 0

                    if isinstance(m_data, dict):
                        st = m_data.get("status", "no_status")
                        model_statuses[m_name][st] += 1
                        vals = m_data.get("values", {})
                        if vals:
                            model_fields[m_name].update(vals.keys())
                            if "single_pass_discretion_rank" in vals or "baseline_discretion_rank" in vals or "single_pass_rank" in vals:
                                single_pass_found[m_name] += 1
                    else:
                        model_statuses[m_name]["non_dict"] += 1

            print(f"Empty/Null coded_values: {null_or_empty_cv} / {len(rows)}")
            print("Document statuses:", dict(doc_statuses))
            print("\nModel statuses breakdown:")
            for m_name, st_counter in model_statuses.items():
                print(f"\nModel: '{m_name}'")
                print(f"  Statuses: {dict(st_counter)}")
                print(f"  Total fields observed: {len(model_fields[m_name])}")
                print(f"  Key strategy fields present:")
                for k in ["cascade_discretion_rank", "m9_discretion_rank", "b3_discretion_rank", "delegate_law", "scope_breadth", "constraint_strength", "single_pass_discretion_rank", "baseline_discretion_rank"]:
                    if k in model_fields[m_name]:
                        print(f"    - {k}")
                print(f"  Single-pass found: {single_pass_found[m_name]}")

            # Let's inspect a few non-empty rows
            print("\nSample rows inspection:")
            for i, r in enumerate(rows[:5]):
                cv = r["coded_values"]
                if isinstance(cv, str): cv = json.loads(cv)
                print(f"\nRow {i} - {r['filename']} - status: {r['status']}")
                if cv:
                    for m, d in cv.items():
                        if isinstance(d, dict):
                            print(f"  Model: {m}, status: {d.get('status')}, error: {d.get('error_message')}, values_count: {len(d.get('values', {}))}")
                        else:
                            print(f"  Model: {m}, non-dict: {type(d)}")

if __name__ == "__main__":
    main()
