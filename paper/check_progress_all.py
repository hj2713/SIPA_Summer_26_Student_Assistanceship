import json
import psycopg
from psycopg.rows import dict_row

db_url = "postgresql://postgres.nqgufodcrkzpeikiudga:LAWDELEGATIONHIMANSHU@aws-1-us-west-1.pooler.supabase.com:6543/postgres"
dashboard_id = "49239894-e7e8-4f0c-877f-2399fc44d0bf"

try:
    conn = psycopg.connect(db_url, prepare_threshold=None, row_factory=dict_row)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT dd.coded_values
        FROM dashboard_documents dd
        WHERE dd.dashboard_id = %s
    """, (dashboard_id,))
    rows = cursor.fetchall()
    conn.close()
    
    models = ["moonshotai/kimi-k2.5", "openai/gpt-oss-120b", "gemini-2.5-flash"]
    stats = {m: {"completed": 0, "processing": 0, "failed": 0, "total": 0} for m in models}
    
    for row in rows:
        coded = row['coded_values']
        if coded:
            if isinstance(coded, str):
                coded = json.loads(coded)
            
            for m in models:
                if m in coded:
                    stats[m]["total"] += 1
                    status = coded[m].get("status")
                    if status == "completed":
                        stats[m]["completed"] += 1
                    elif status == "processing":
                        stats[m]["processing"] += 1
                    elif status == "failed":
                        stats[m]["failed"] += 1
                        
    print("=== All Running Campaigns Progress ===")
    for m in models:
        c = stats[m]["completed"]
        p = stats[m]["processing"]
        f = stats[m]["failed"]
        print(f"\nModel: {m}")
        print(f"  Completed:  {c} / 169 ({c/169:.1%})")
        print(f"  Processing: {p} / 169")
        print(f"  Failed:     {f} / 169")
        
except Exception as e:
    print(f"Error checking progress: {e}")
