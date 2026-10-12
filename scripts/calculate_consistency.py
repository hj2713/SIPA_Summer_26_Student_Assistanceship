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

def map_implied_rank(delegation, authority, constraint):
    """
    Implements m(d_hat, a_hat, c_hat):
    0 if d_hat == 0 (or False)
    1 if d_hat == 1, a_hat == Low,  c_hat == Strong
    2 if d_hat == 1, a_hat == Low,  c_hat == Weak
    3 if d_hat == 1, a_hat == High, c_hat == Strong
    4 if d_hat == 1, a_hat == High, c_hat == Weak
    """
    if delegation is False or delegation == 0 or str(delegation).strip() in ("0", "False", "false", "No", "no"):
        return 0
    
    # Normalize authority
    a_str = str(authority).strip().lower() if authority is not None else ""
    if "high" in a_str:
        a_val = "High"
    elif "low" in a_str:
        a_val = "Low"
    else:
        a_val = None

    # Normalize constraint
    c_str = str(constraint).strip().lower() if constraint is not None else ""
    if "strong" in c_str:
        c_val = "Strong"
    elif "weak" in c_str:
        c_val = "Weak"
    else:
        c_val = None

    if a_val == "Low" and c_val == "Strong":
        return 1
    elif a_val == "Low" and c_val == "Weak":
        return 2
    elif a_val == "High" and c_val == "Strong":
        return 3
    elif a_val == "High" and c_val == "Weak":
        return 4
    return None

def run():
    db_url = settings.DATABASE_URL
    print(f"Connecting to database...")
    with psycopg.connect(db_url, prepare_threshold=None, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # 1. Find all dashboards that contain coded_values
            cur.execute("""
                SELECT d.id, d.name, count(dd.document_id) as total_docs,
                       count(dd.coded_values) as coded_docs
                FROM dashboards d
                JOIN dashboard_documents dd ON d.id = dd.dashboard_id
                WHERE dd.coded_values IS NOT NULL
                GROUP BY d.id, d.name
                ORDER BY coded_docs DESC
            """)
            dashboards = cur.fetchall()
            print("\nDashboards with coded_values:")
            for d in dashboards:
                print(f"  ID: {d['id']} | Name: '{d['name']}' | Coded docs: {d['coded_docs']}")

            for target_dash in dashboards:
                dash_id = target_dash['id']
                print(f"\n=======================================================")
                print(f"Analyzing Dashboard: {dash_id} ('{target_dash['name']}')")
                print(f"=======================================================")
                
                cur.execute("""
                    SELECT doc.filename, dd.coded_values
                    FROM dashboard_documents dd
                    JOIN documents doc ON dd.document_id = doc.id
                    WHERE dd.dashboard_id = %s AND dd.coded_values IS NOT NULL
                """, (dash_id,))
                rows = cur.fetchall()
                
                # Check data format
                model_records = {} # {model_key: [records]}
                for r in rows:
                    cv = r["coded_values"]
                    if not cv:
                        continue
                    if isinstance(cv, str):
                        try:
                            cv = json.loads(cv)
                        except:
                            continue
                    if not isinstance(cv, dict):
                        continue

                    # Could be {model_name: {values: {...}, status: ...}}
                    # OR could be flat {field: val}
                    if any(isinstance(v, dict) and "values" in v for v in cv.values()):
                        for m_name, m_data in cv.items():
                            if isinstance(m_data, dict):
                                vals = m_data.get("values", {})
                                if vals:
                                    if m_name not in model_records:
                                        model_records[m_name] = []
                                    model_records[m_name].append({
                                        "filename": r["filename"],
                                        "vals": vals,
                                        "status": m_data.get("status")
                                    })
                    else:
                        # Flat format
                        m_name = "default"
                        if m_name not in model_records:
                            model_records[m_name] = []
                        model_records[m_name].append({
                            "filename": r["filename"],
                            "vals": cv,
                            "status": "completed"
                        })

                print(f"Models found in this dashboard: {list(model_records.keys())}")
                for m_name, recs in model_records.items():
                    print(f"\n--- Model: {m_name} ({len(recs)} total document records) ---")
                    
                    # Check field availability
                    sample_vals = recs[0]["vals"] if recs else {}
                    print(f"Sample keys: {list(sample_vals.keys())[:15]}")
                    
                    # Strategies:
                    # Cascade: cascade_discretion_rank
                    # Direct (M9): m9_discretion_rank (or direct_discretion_rank)
                    # Two-band (B3): b3_discretion_rank (or twoband_discretion_rank)
                    strategy_fields = {
                        "Cascade": ["cascade_discretion_rank", "discretion_rank_cascade", "cascade_rank"],
                        "Direct": ["m9_discretion_rank", "direct_discretion_rank", "m9_rank", "direct_rank"],
                        "Two-Band": ["b3_discretion_rank", "twoband_discretion_rank", "b3_rank", "two_band_rank"]
                    }
                    
                    for strat_name, field_candidates in strategy_fields.items():
                        strat_field = None
                        for fc in field_candidates:
                            if any(fc in r["vals"] for r in recs):
                                strat_field = fc
                                break
                        
                        if not strat_field:
                            # Let's check if any candidate exists
                            continue

                        # Compute consistency
                        N_s = 0
                        consistent_count = 0
                        inconsistent_count = 0
                        missing_components = 0

                        for r in recs:
                            vals = r["vals"]
                            strat_rank = vals.get(strat_field)
                            if strat_rank is None or str(strat_rank).strip() in ("", "null", "None"):
                                continue

                            try:
                                strat_rank_int = int(strat_rank)
                            except:
                                continue

                            # Get components
                            # Delegation
                            delegation = vals.get("delegate_law", vals.get("delegation", vals.get("d_hat")))
                            # Authority
                            authority = vals.get("scope_breadth", vals.get("authority", vals.get("a_hat")))
                            # Constraint
                            constraint = vals.get("constraint_strength", vals.get("constraint", vals.get("c_hat")))

                            implied_rank = map_implied_rank(delegation, authority, constraint)
                            
                            # Also check if y_map is pre-stored!
                            prestored_ymap = vals.get("y_map", vals.get("y_implied", vals.get("theory_implied_rank")))
                            if implied_rank is None and prestored_ymap is not None:
                                try:
                                    implied_rank = int(prestored_ymap)
                                except:
                                    pass

                            if implied_rank is None:
                                missing_components += 1
                                continue

                            N_s += 1
                            if strat_rank_int == implied_rank:
                                consistent_count += 1
                            else:
                                inconsistent_count += 1

                        if N_s > 0:
                            rate = (consistent_count / N_s) * 100.0
                            print(f"  Strategy: {strat_name:10} (field: {strat_field}) -> N = {N_s:3d} | Consistent: {consistent_count:3d} | Inconsistent: {inconsistent_count:3d} | Rate: {rate:6.2f}% (Missing components: {missing_components})")
                        else:
                            print(f"  Strategy: {strat_name:10} (field: {strat_field}) -> No completed cases with both ranks available.")

if __name__ == "__main__":
    run()
