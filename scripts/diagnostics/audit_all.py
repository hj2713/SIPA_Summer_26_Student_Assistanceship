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
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                ORDER BY table_name;
            """)
            print("Tables:", [r['table_name'] for r in cur.fetchall()])
            
            cur.execute("""
                SELECT id, name, created_at, workflow_definition_json IS NOT NULL as has_wf
                FROM dashboards 
                ORDER BY created_at DESC;
            """)
            print("\nDashboards:")
            dashboards = cur.fetchall()
            for r in dashboards:
                print(r)

            print("\nDocuments per dashboard:")
            cur.execute("""
                SELECT d.id, d.name, count(dd.document_id) as total_docs,
                       count(dd.coded_values) filter (where dd.coded_values is not null and dd.coded_values::text != '{}') as coded_docs,
                       count(dd.status) filter (where dd.status = 'completed') as completed_status
                FROM dashboards d
                LEFT JOIN dashboard_documents dd ON d.id = dd.dashboard_id
                GROUP BY d.id, d.name
                ORDER BY total_docs DESC;
            """)
            for r in cur.fetchall():
                print(r)

if __name__ == "__main__":
    main()
