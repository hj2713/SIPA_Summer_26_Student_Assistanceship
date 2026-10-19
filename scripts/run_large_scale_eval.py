import os
import sys
import asyncio
import sqlite3
import json
import csv
import re
import time
import math

# Resolve directories
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(root_dir, "backend")

# Insert backend dir to path and change cwd to load settings and DB
os.chdir(backend_dir)
sys.path.insert(0, backend_dir)

try:
    from app.core.config import settings
    from app.workflows.executor import WorkflowExecutor
    from app.workflows.professor_discretion_suite_detailed import professor_discretion_prompt_suite_detailed_definition
except ImportError as e:
    print(f"Error importing backend components: {e}")
    sys.exit(1)

def extract_pl(filename):
    m = re.search(r'(\d+-\d+)', filename)
    if m:
        return m.group(1)
    return None

def compute_kappa(confusion_matrix, weights='quadratic'):
    # confusion_matrix is a dict of dicts: {true_rank: {pred_rank: count}}
    # Ranks are 0, 1, 2, 3, 4
    categories = sorted(list(confusion_matrix.keys()))
    n = len(categories)
    if n <= 1:
        return 0.0
        
    total_n = 0
    O = [[0.0]*n for _ in range(n)]
    row_sums = [0.0]*n
    col_sums = [0.0]*n
    
    for i, r_t in enumerate(categories):
        for j, r_p in enumerate(categories):
            count = confusion_matrix[r_t].get(r_p, 0)
            O[i][j] = float(count)
            total_n += count
            row_sums[i] += count
            col_sums[j] += count
            
    if total_n == 0:
        return 0.0
        
    # Expected matrix
    E = [[0.0]*n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            E[i][j] = (row_sums[i] * col_sums[j]) / total_n
            
    # Weights matrix
    W = [[0.0]*n for _ in range(n)]
    max_diff = float(categories[-1] - categories[0])
    if max_diff == 0:
        return 1.0
        
    for i in range(n):
        for j in range(n):
            diff = abs(categories[i] - categories[j])
            if weights == 'quadratic':
                W[i][j] = (diff / max_diff) ** 2
            elif weights == 'linear':
                W[i][j] = (diff / max_diff)
            else:
                W[i][j] = 1.0 if i != j else 0.0
                
    # Weighted kappa formula
    num = 0.0
    den = 0.0
    for i in range(n):
        for j in range(n):
            num += W[i][j] * O[i][j]
            den += W[i][j] * E[i][j]
            
    if den == 0:
        return 0.0
    return 1.0 - (num / den)

async def run_campaign(model_name, documents_list, semaphore_limit=5):
    sem = asyncio.Semaphore(semaphore_limit)
    executor = WorkflowExecutor()
    definition = professor_discretion_prompt_suite_detailed_definition()
    
    results = {}
    
    async def run_one(doc_id, file_path, filename):
        async with sem:
            full_path = os.path.join("data/storage", file_path)
            if not os.path.exists(full_path):
                # Fallback to absolute workspace path if needed
                full_path = os.path.join(root_dir, "backend", "data", "storage", file_path)
                
            if not os.path.exists(full_path):
                print(f"File not found: {filename} ({full_path})")
                return doc_id, None
                
            with open(full_path, "r", encoding="utf-8") as f:
                text = f.read()
                
            start_time = time.time()
            try:
                # Execute detailed workflow
                res = await executor.execute(definition, text, model_override=model_name)
                duration = time.time() - start_time
                return doc_id, {
                    "success": True,
                    "outputs": res,
                    "duration": duration,
                    "model": model_name
                }
            except Exception as ex:
                print(f"Error running {filename} on {model_name}: {ex}")
                return doc_id, {
                    "success": False,
                    "error": str(ex)
                }
                
    tasks = [run_one(r["id"], r["file_path"], r["filename"]) for r in documents_list]
    for completed_task in asyncio.as_completed(tasks):
        doc_id, res = await completed_task
        if res:
            results[doc_id] = res
            
    return results

def main():
    print("--- Replicable Theory-Guided LLM Workflow Large-Scale Evaluation Runner ---")
    print(f"Cwd: {os.getcwd()}")
    
    # 1. Load benchmark from CSV
    csv_path = os.path.join(root_dir, "Updates", "Test - Summary of all laws.csv")
    if not os.path.exists(csv_path):
        print(f"Benchmark CSV not found at: {csv_path}")
        sys.exit(1)
        
    csv_laws = {}
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            pl = extract_pl(row['Filename'])
            if pl:
                csv_laws[pl] = {
                    'filename': row['Filename'],
                    'delegate_law': row['DelegationLaw (Y/N)'].strip().upper() == 'TRUE',
                    'discretion_rank': float(row['RG_Discretion_Rank']) if row['RG_Discretion_Rank'] else 0.0
                }
    print(f"Loaded {len(csv_laws)} benchmark laws from CSV.")
    
    # 2. Get list of documents from SQLite
    db_path = "data/local_rag.db"
    if not os.path.exists(db_path):
        db_path = os.path.join(root_dir, "backend", "data", "local_rag.db")
        
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Query files associated with campaign 048ade65-1be5-4d50-ad94-b0051f5a9403
    cursor.execute("""
        SELECT d.id, d.file_path, d.filename
        FROM dashboard_documents dd
        JOIN documents d ON dd.document_id = d.id
        WHERE dd.dashboard_id = '048ade65-1be5-4d50-ad94-b0051f5a9403'
    """)
    db_docs = [dict(r) for r in cursor.fetchall()]
    conn.close()
    
    print(f"Found {len(db_docs)} documents in SQLite campaign database.")
    
    if len(sys.argv) < 2:
        print("\nUsage:")
        print("  python3 run_large_scale_eval.py --run [model_name]      (runs evaluation for model)")
        print("  python3 run_large_scale_eval.py --stability [model_name] (runs stability test 3x)")
        print("  python3 run_large_scale_eval.py --metrics [json_file]   (calculates and prints LaTeX tables)")
        sys.exit(0)
        
    mode = sys.argv[1]
    
    if mode == "--run":
        if len(sys.argv) < 3:
            model_name = "gemini-3.1-flash-lite-preview"
        else:
            model_name = sys.argv[2]
        print(f"Running evaluation campaign on {len(db_docs)} documents using {model_name}...")
        results = asyncio.run(run_campaign(model_name, db_docs))
        
        output_file = f"large_scale_results_{model_name.replace('/', '_')}.json"
        with open(output_file, "w") as f:
            json.dump(results, f, indent=2)
        print(f"Saved results to {output_file}")
        
    elif mode == "--stability":
        if len(sys.argv) < 3:
            model_name = "gemini-3.1-flash-lite-preview"
        else:
            model_name = sys.argv[2]
            
        print(f"Running stability test (3 repeat runs) on {len(db_docs)} documents using {model_name}...")
        all_runs = []
        for run_idx in range(3):
            print(f"\n--- Starting repeat run {run_idx+1} of 3 ---")
            run_res = asyncio.run(run_campaign(model_name, db_docs))
            all_runs.append(run_res)
            
        output_file = f"stability_runs_{model_name.replace('/', '_')}.json"
        with open(output_file, "w") as f:
            json.dump(all_runs, f, indent=2)
        print(f"Saved stability runs to {output_file}")
        
    elif mode == "--metrics":
        if len(sys.argv) < 3:
            print("Please specify the JSON results file.")
            sys.exit(1)
        json_file = sys.argv[2]
        with open(json_file, "r") as f:
            results = json.load(f)
            
        # Calculate statistics
        # We compute for CASCADE, M9, B3
        strategies = ['cascade', 'm9', 'b3']
        stats = {s: {'exact': 0, 'w1': 0, 'mae_sum': 0.0, 'n': 0, 'conf': {t: {p: 0 for p in range(5)} for t in range(5)}} for s in strategies}
        
        for doc_id, res in results.items():
            if not res.get("success"):
                continue
                
            outputs = res.get("outputs", {})
            # Find document in db_docs to get filename and PL
            # Wait, let's look up document filename from matching database id or name
            # Let's extract PL number from the output or save filename in run
            # In executor results, we can find it by querying database or matching filename
            # Let's find PL from database info
            filename = None
            for d in db_docs:
                if d["id"] == doc_id:
                    filename = d["filename"]
                    break
                    
            if not filename:
                continue
                
            pl = extract_pl(filename)
            if not pl or pl not in csv_laws:
                continue
                
            true_rank = int(csv_laws[pl]['discretion_rank'])
            
            for s in strategies:
                pred_field = f"{s}_discretion_rank"
                pred_rank = outputs.get(pred_field)
                if pred_rank is None:
                    continue
                    
                pred_rank = int(pred_rank)
                stats[s]['n'] += 1
                stats[s]['mae_sum'] += abs(true_rank - pred_rank)
                if true_rank == pred_rank:
                    stats[s]['exact'] += 1
                if abs(true_rank - pred_rank) <= 1:
                    stats[s]['w1'] += 1
                    
                stats[s]['conf'][true_rank][pred_rank] += 1
                
        print("\n--- Summary of Results ---")
        for s in strategies:
            n = stats[s]['n']
            if n > 0:
                exact_acc = stats[s]['exact'] / n
                w1_acc = stats[s]['w1'] / n
                mae = stats[s]['mae_sum'] / n
                
                lin_kappa = compute_kappa(stats[s]['conf'], weights='linear')
                quad_kappa = compute_kappa(stats[s]['conf'], weights='quadratic')
                
                print(f"\nStrategy: {s.upper()} (N={n})")
                print(f"  Exact Accuracy: {exact_acc:.2%}")
                print(f"  Within-One Accuracy: {w1_acc:.2%}")
                print(f"  MAE: {mae:.3f}")
                print(f"  Linear Weighted Kappa: {lin_kappa:.4f}")
                print(f"  Quadratic Weighted Kappa: {quad_kappa:.4f}")
                
        # Generate LaTeX table code
        print("\n--- LaTeX code for Table 5 ---")
        print("\\begin{table}[t]")
        print("\\centering")
        print("\\caption{Cross-model evaluation results on the full available discretionary corpus (N \\ge 150).}")
        print("\\label{tab:multimodel_large}")
        print("\\scriptsize")
        print("\\begin{tabular}{@{}llrrrrr@{}}")
        print("\\toprule")
        print("\\textbf{Model} & \\textbf{Strategy} & \\textbf{Exact} & \\textbf{W1} & \\textbf{MAE} & \\textbf{Linear $\\kappa_w$} & \\textbf{Quad $\\kappa_w$} \\\\")
        print("\\midrule")
        
        # Print for the loaded model results
        model_lbl = "G3.1-lite"
        for s in strategies:
            n = stats[s]['n']
            if n > 0:
                exact_acc = stats[s]['exact'] / n
                w1_acc = stats[s]['w1'] / n
                mae = stats[s]['mae_sum'] / n
                lin_kappa = compute_kappa(stats[s]['conf'], weights='linear')
                quad_kappa = compute_kappa(stats[s]['conf'], weights='quadratic')
                
                strat_lbl = "Sequential Ordinal Cascade" if s == 'cascade' else "Direct Multiclass Prediction" if s == 'm9' else "Two-Band Classification"
                print(f"{model_lbl} & {strat_lbl} & {exact_acc:.1%} & {w1_acc:.1%} & {mae:.3f} & {lin_kappa:.3f} & {quad_kappa:.3f} \\\\")
        print("\\bottomrule")
        print("\\end{tabular}")
        print("\\end{table}")

if __name__ == "__main__":
    main()
