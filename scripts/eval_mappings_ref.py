backend/venv/bin/python -c '
import os, sys, json, psycopg
from psycopg.rows import dict_row

sys.path.insert(0, "backend")
os.chdir("backend")
from app.core.config import settings

with psycopg.connect(settings.DATABASE_URL, prepare_threshold=None, row_factory=dict_row) as conn:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT doc.filename, dd.coded_values
            FROM dashboard_documents dd
            JOIN documents doc ON dd.document_id = doc.id
            WHERE dd.dashboard_id = %s
            ORDER BY doc.filename
        """, ("c45796b6-18b5-46ad-a805-4066fec7feaf",))
        rows = cur.fetchall()

models = ["gemini-3.1-flash-lite", "deepseek/deepseek-chat", "qwen/qwen3-235b-a22b-2507", "openai/gpt-oss-120b"]

def eval_mapping(auth_map, con_map, name):
    print(f"\n==================== MAPPING: {name} ====================")
    h_m, h_c, h_d, h_tb = "Model", "Cascade", "Direct", "Two-Band"
    print(f"{h_m:<25} | {h_c:^16} | {h_d:^16} | {h_tb:^16}")
    print("-" * 78)
    for m in models:
        strat_results = {}
        for strat, field in [("Cascade", "cascade_discretion_rank"), ("Direct", "m9_discretion_rank"), ("Two-Band", "b3_discretion_rank")]:
            consistent = 0
            total = 0
            for r in rows:
                cv = r["coded_values"]
                if isinstance(cv, str): cv = json.loads(cv)
                vals = cv.get(m, {}).get("values", {})
                if not vals or vals.get("delegate_law") is None: continue
                
                d = vals.get("delegate_law")
                sb = str(vals.get("scope_breadth", "")).lower()
                cs = str(vals.get("constraint_strength", "")).lower()
                strat_rank = vals.get(field)
                if strat_rank is None: continue
                
                # Implied rank
                if d is False or str(d).lower() in ("false", "0", "no"):
                    implied = 0
                else:
                    a = auth_map.get(sb)
                    c = con_map.get(cs)
                    if a == "Low" and c == "Strong": implied = 1
                    elif a == "Low" and c == "Weak": implied = 2
                    elif a == "High" and c == "Strong": implied = 3
                    elif a == "High" and c == "Weak": implied = 4
                    else: implied = None
                
                if implied is not None:
                    total += 1
                    if int(strat_rank) == implied:
                        consistent += 1
            rate = (consistent / total * 100) if total else 0
            strat_results[strat] = f"{rate:.1f}% ({consistent}/{total})"
        c_res = strat_results["Cascade"]
        d_res = strat_results["Direct"]
        tb_res = strat_results["Two-Band"]
        print(f"{m:<25} | {c_res:^16} | {d_res:^16} | {tb_res:^16}")

eval_mapping({"narrow": "Low", "moderate": "Low", "broad": "High"},
             {"strong": "Strong", "moderate": "Strong", "weak": "Weak"},
             "A: auth={narrow,mod->Low, broad->High}, con={strong,mod->Strong, weak->Weak}")

eval_mapping({"narrow": "Low", "moderate": "Low", "broad": "High"},
             {"strong": "Strong", "moderate": "Weak", "weak": "Weak"},
             "B: auth={narrow,mod->Low, broad->High}, con={strong->Strong, mod,weak->Weak}")

eval_mapping({"narrow": "Low", "moderate": "High", "broad": "High"},
             {"strong": "Strong", "moderate": "Strong", "weak": "Weak"},
             "C: auth={narrow->Low, mod,broad->High}, con={strong,mod->Strong, weak->Weak}")

eval_mapping({"narrow": "Low", "moderate": "High", "broad": "High"},
             {"strong": "Strong", "moderate": "Weak", "weak": "Weak"},
             "D: auth={narrow->Low, mod,broad->High}, con={strong->Strong, mod,weak->Weak}")
'