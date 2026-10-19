import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND = os.path.join(ROOT, "backend")
sys.path.insert(0, BACKEND)
os.chdir(BACKEND)

from app.core.config import settings
import psycopg
from psycopg.rows import dict_row

with psycopg.connect(settings.DATABASE_URL, row_factory=dict_row) as conn:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT model, 
                   COUNT(*) as call_count, 
                   SUM(input_tokens) as total_in, 
                   SUM(output_tokens) as total_out,
                   SUM(calculated_cost) as total_cost
            FROM llm_usage_logs
            WHERE campaign_id = %s
            GROUP BY model
            ORDER BY total_cost DESC;
        """, ("c45796b6-18b5-46ad-a805-4066fec7feaf",))
        rows = cur.fetchall()
        print("=== LLM USAGE & COST BREAKDOWN FOR THIS DASHBOARD ===")
        total = 0.0
        for r in rows:
            c = float(r["total_cost"]) if r["total_cost"] else 0.0
            m = r["model"]
            cnt = r["call_count"]
            tin = r["total_in"] or 0
            tout = r["total_out"] or 0
            print(f"Model: {m}")
            print(f"  Calls: {cnt} | Input: {tin:,} | Output: {tout:,} | Cost: ${c:.4f}")
            total += c
        print(f"Total calculated cost: ${total:.4f}")
