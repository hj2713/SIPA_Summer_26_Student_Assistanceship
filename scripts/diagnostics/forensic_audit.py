import sys, os, psycopg, json
os.chdir("backend")
sys.path.insert(0, ".")
from app.core.config import settings

dashboard_id = "c45796b6-18b5-46ad-a805-4066fec7feaf"

with psycopg.connect(settings.DATABASE_URL, prepare_threshold=None) as conn:
    with conn.cursor() as cur:
        # Group by date(timestamp) and model
        cur.execute("""
            SELECT date_trunc('day', timestamp) as day,
                   model, 
                   COUNT(*) as call_count,
                   SUM(input_tokens) as in_tokens,
                   SUM(output_tokens) as out_tokens,
                   SUM(calculated_cost) as total_cost
            FROM llm_usage_logs
            WHERE campaign_id = %s
            GROUP BY day, model
            ORDER BY day DESC, total_cost DESC;
        """, (dashboard_id,))
        logs_summary = cur.fetchall()

        print("=== LLM USAGE LOGS BY DAY FOR THIS DASHBOARD ===")
        for row in logs_summary:
            day_str = row[0].strftime("%Y-%m-%d") if row[0] else "unknown"
            print(f"Date: {day_str} | Model: {row[1]} | Calls: {row[2]} | In: {row[3]:,} | Out: {row[4]:,} | Cost: ${row[5]:.4f}")

        # Check completed coded_values timestamps in dashboard_documents
        cur.execute("""
            SELECT dd.document_id, d.filename, dd.coded_values
            FROM dashboard_documents dd
            JOIN documents d ON dd.document_id = d.id
            WHERE dd.dashboard_id = %s;
        """, (dashboard_id,))
        rows = cur.fetchall()

print("\n=== COMPLETED EVALUATIONS IN DB ===")
model_counts = {}
timestamp_distribution = {}
model_day_distribution = {}

for r in rows:
    cv = r[2]
    if not cv: continue
    if isinstance(cv, str): cv = json.loads(cv)
    for m, d in cv.items():
        if isinstance(d, dict) and d.get("status") == "completed":
            model_counts[m] = model_counts.get(m, 0) + 1
            t = d.get("timing", {}).get("completed_at")
            if t:
                day_str = t[:10]
                timestamp_distribution[day_str] = timestamp_distribution.get(day_str, 0) + 1
                if day_str not in model_day_distribution:
                    model_day_distribution[day_str] = {}
                model_day_distribution[day_str][m] = model_day_distribution[day_str].get(m, 0) + 1

print("Completed count per model key:", model_counts)
print("Completed evaluations by completion date:", timestamp_distribution)
print("By model and date:", json.dumps(model_day_distribution, indent=2))
