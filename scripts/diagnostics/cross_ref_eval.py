import os
import sys
import json
import csv
import re

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(root_dir, "backend")
sys.path.insert(0, backend_dir)
os.chdir(backend_dir)

from app.core.config import settings
import psycopg
from psycopg.rows import dict_row

def extract_pl(filename):
    m = re.search(r'(\d+-\d+)', filename)
    return m.group(1) if m else None

def main():
    # 1. Read benchmark CSV
    csv_path = os.path.join(root_dir, "Updates", "Test - Summary of all laws.csv")
    csv_laws = {}
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            pl = extract_pl(row['Filename'])
            if pl:
                is_del = str(row.get('DelegationLaw (Y/N)', '')).strip().upper() in ('TRUE', '1', 'YES', 'Y')
                rank_str = row.get('RG_Discretion_Rank', '')
                try:
                    rank = float(rank_str)
                except:
                    rank = None
                csv_laws[pl] = {
                    'filename': row['Filename'],
                    'delegation': is_del,
                    'rank': rank
                }

    print(f"Total laws in CSV: {len(csv_laws)}")
    del_count = sum(1 for v in csv_laws.values() if v['delegation'])
    non_del_count = len(csv_laws) - del_count
    print(f"Delegated laws: {del_count}, Non-delegated laws: {non_del_count}")

    # 2. Check documents in 37a604aa-693e-4945-a89c-5df41b127710
    dash_id = "37a604aa-693e-4945-a89c-5df41b127710"
    with psycopg.connect(settings.DATABASE_URL, prepare_threshold=None, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT dd.document_id, doc.filename, doc.file_path, length(doc.source_text) as text_len,
                       dd.status, dd.coded_values
                FROM dashboard_documents dd
                JOIN documents doc ON dd.document_id = doc.id
                WHERE dd.dashboard_id = %s
            """, (dash_id,))
            docs = cur.fetchall()

    print(f"\nTotal documents in dashboard {dash_id}: {len(docs)}")
    matched_pl = 0
    matched_del = 0
    matched_nondel = 0
    unmatched = []

    for d in docs:
        pl = extract_pl(d['filename'])
        if pl and pl in csv_laws:
            matched_pl += 1
            if csv_laws[pl]['delegation']:
                matched_del += 1
            else:
                matched_nondel += 1
        else:
            unmatched.append(d['filename'])

    print(f"Matched PLs in CSV: {matched_pl}")
    print(f"  Delegated: {matched_del}")
    print(f"  Non-delegated: {matched_nondel}")
    if unmatched:
        print(f"Unmatched filenames: {unmatched}")

    # Check workflow definition for 37a604aa-693e-4945-a89c-5df41b127710
    with psycopg.connect(settings.DATABASE_URL, prepare_threshold=None, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT workflow_definition_json FROM dashboards WHERE id = %s", (dash_id,))
            wf = cur.fetchone()["workflow_definition_json"]
            if isinstance(wf, str): wf = json.loads(wf)
            print(f"\nWorkflow definition has {len(wf.get('nodes', []))} nodes and {len(wf.get('edges', []))} edges.")
            print("Node names / IDs in workflow:")
            for n in wf.get("nodes", []):
                print(f"  {n.get('id')}: {n.get('name')} (type: {n.get('type')})")

if __name__ == "__main__":
    main()
