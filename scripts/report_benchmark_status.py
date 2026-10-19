import os
import sys
import json
import time
from datetime import UTC, datetime

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(root_dir, "backend")
sys.path.insert(0, backend_dir)
os.chdir(backend_dir)

from app.core.config import settings
import psycopg
from psycopg.rows import dict_row

DEFAULT_DASHBOARD_ID = "c45796b6-18b5-46ad-a805-4066fec7feaf"

TARGET_MODELS = [
    ("Gemini 3.5 / 3.1", ["gemini-3.1-flash-lite", "gemini-3.5-flash"]),
    ("DeepSeek", ["deepseek/deepseek-v3.2-exp", "deepseek/deepseek-chat"]),
    ("Qwen 3", ["qwen/qwen3-235b-a22b-2507"]),
    ("Kimi K2.5", ["moonshotai/kimi-k2.5"]),
    ("GPT-OSS", ["openai/gpt-oss-120b"]),
]

STATE_FILE = os.path.join(root_dir, "logs", "status_tracker.json")

def get_status(dashboard_id=DEFAULT_DASHBOARD_ID):
    with psycopg.connect(settings.DATABASE_URL, prepare_threshold=None, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT dd.document_id, doc.filename, dd.status, dd.coded_values
                FROM dashboard_documents dd
                JOIN documents doc ON dd.document_id = doc.id
                WHERE dd.dashboard_id = %s
            """, (dashboard_id,))
            rows = cur.fetchall()

    total_docs = len(rows)
    model_stats = {} # display_name -> {'staged': 0, 'baseline': 0, 'both': 0, 'failed': 0}

    for disp_name, keys in TARGET_MODELS:
        model_stats[disp_name] = {"staged": 0, "baseline": 0, "both": 0, "failed": 0}
        for r in rows:
            cv = r["coded_values"]
            if not cv:
                continue
            if isinstance(cv, str):
                try: cv = json.loads(cv)
                except: continue
            
            found_m = False
            for k in keys:
                m_data = cv.get(k, {})
                if not isinstance(m_data, dict):
                    continue
                vals = m_data.get("values", {})
                st = m_data.get("status")
                has_staged = "cascade_discretion_rank" in vals and vals.get("cascade_discretion_rank") is not None
                has_baseline = "single_pass_discretion_rank" in vals and vals.get("single_pass_discretion_rank") is not None
                if has_staged or has_baseline or st:
                    if st == "failed":
                        model_stats[disp_name]["failed"] += 1
                    if has_staged:
                        model_stats[disp_name]["staged"] += 1
                    if has_baseline:
                        model_stats[disp_name]["baseline"] += 1
                    if has_staged and has_baseline:
                        model_stats[disp_name]["both"] += 1
                    found_m = True
                    break

    # Overall completed: documents where all models are complete (or tracking total task units completed)
    total_target_units = total_docs * len(TARGET_MODELS)
    total_completed_units = sum(s["both"] for s in model_stats.values())
    overall_pct = (total_completed_units / total_target_units * 100) if total_target_units else 0

    # Calculate velocity using state file
    now_ts = time.time()
    prev_units = 0
    prev_ts = now_ts - 900
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r") as f:
                prev_state = json.load(f)
                prev_units = prev_state.get("completed_units", 0)
                prev_ts = prev_state.get("timestamp", now_ts - 900)
        except Exception:
            pass

    delta_units = max(0, total_completed_units - prev_units)
    # Save current state
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump({"completed_units": total_completed_units, "timestamp": now_ts}, f)

    # Check recent errors / rate limits from log file
    log_path = os.path.join(root_dir, "logs", "benchmark_run.log")
    recent_errors = "None"
    if os.path.exists(log_path):
        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()[-50:]
            err_lines = [l.strip() for l in lines if "Rate limited" in l or "FAILED" in l or "Error" in l]
            if err_lines:
                recent_errors = f"{len(err_lines)} warnings/retries in recent activity (latest: {err_lines[-1][:90]})"

    report = []
    report.append(f"⏱️ [15-Min Progress Update]")
    report.append(f"• Overall Progress: {total_completed_units} / {total_target_units} model-law evaluations ({overall_pct:.1f}%)")
    report.append(f"• By Model (Staged Complete / Baseline Complete / Target = {total_docs}):")
    for disp_name, _ in TARGET_MODELS:
        s = model_stats[disp_name]
        report.append(f"  - {disp_name}: Staged {s['staged']}/{total_docs} | Baseline {s['baseline']}/{total_docs} (Full: {s['both']}/{total_docs})")
    report.append(f"• Current Velocity: ~{delta_units} evaluations completed in the last period")
    report.append(f"• Errors / Rate Limits: {recent_errors}")

    output_str = "\n".join(report)
    print(output_str)
    return output_str

if __name__ == "__main__":
    get_status()
