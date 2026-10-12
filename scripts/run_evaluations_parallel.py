#!/usr/bin/env python3
"""
run_evaluations_parallel.py
───────────────────────────
Evaluates the 15 benchmark laws across models in parallel for dashboard:
  c45796b6-18b5-46ad-a805-4066fec7feaf

Runs the workflow executor locally, saving outputs directly to Supabase
so that the live Vercel dashboard and Table 5 consistency calculations
update in real-time.
"""

import os
import sys
import json
import time
import asyncio
import logging
from datetime import UTC, datetime

# Disable LangSmith tracing to prevent 403 noise
os.environ["LANGCHAIN_TRACING_V2"] = "false"
os.environ["LANGSMITH_TRACING"] = "false"

# Bootstrap backend paths
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")
sys.path.insert(0, BACKEND_DIR)
os.chdir(BACKEND_DIR)

from app.core.config import settings
from app.workflows.executor import workflow_executor
from app.workflows.schema_fields import extract_dashboard_schema_fields
import psycopg
from psycopg.rows import dict_row

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("parallel_eval")

DASHBOARD_ID = "c45796b6-18b5-46ad-a805-4066fec7feaf"
TARGET_MODELS = [
    "deepseek/deepseek-chat",
    "qwen/qwen3-235b-a22b-2507",
    "moonshotai/kimi-k2.5",
    "openai/gpt-oss-120b",
]
MAX_PER_MODEL_CONCURRENCY = 2
GLOBAL_CONCURRENCY = 8


def get_db_connection():
    return psycopg.connect(
        settings.DATABASE_URL,
        prepare_threshold=None,
        row_factory=dict_row,
    )


def extract_reasoning(col_name: str, workflow_source: str | None, model_context: dict) -> str | None:
    if not workflow_source:
        return None
    parts = str(workflow_source).split(".")
    node_id = parts[0]
    field_name = parts[1] if len(parts) > 1 else node_id
    candidates = [
        f"{node_id}.{field_name}_reasoning", f"{node_id}.{field_name}_rationale",
        f"{node_id}.{field_name}_explanation", f"{node_id}.{col_name}_reasoning",
        f"{node_id}.{col_name}_rationale", f"{node_id}.{col_name}_explanation",
        f"{node_id}.reasoning", f"{node_id}.rationale",
        f"{field_name}_reasoning", f"{field_name}_rationale",
        f"{col_name}_reasoning", f"{col_name}_rationale",
    ]
    for c in candidates:
        if c in model_context and model_context[c]:
            return str(model_context[c])
    for k, v in model_context.items():
        if k.startswith(node_id + ".") and "reason" in k.lower() and v:
            return str(v)
    return None


async def evaluate_task(
    global_sem: asyncio.Semaphore,
    model_sem: asyncio.Semaphore,
    doc_info: dict,
    model: str,
    definition: dict,
    schema_fields: list,
    task_idx: int,
    total_tasks: int,
):
    doc_id = doc_info["document_id"]
    filename = os.path.basename(doc_info["filename"])
    source_text = doc_info["source_text"]

    async with global_sem:
        async with model_sem:
            t0 = time.perf_counter()
            logger.info(
                "[%d/%d] ▶ START  [%s] on %s (chars=%d)",
                task_idx, total_tasks, model, filename, len(source_text)
            )

            # Mark in DB that this model is running
            try:
                with get_db_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            "SELECT coded_values FROM dashboard_documents WHERE dashboard_id = %s AND document_id = %s FOR UPDATE",
                            (DASHBOARD_ID, doc_id),
                        )
                        row = cur.fetchone()
                        cv = row["coded_values"] if row and row["coded_values"] else {}
                        if isinstance(cv, str):
                            cv = json.loads(cv)
                        if model not in cv:
                            cv[model] = {}
                        cv[model]["status"] = "processing"
                        cur.execute(
                            "UPDATE dashboard_documents SET coded_values = %s, status = 'processing' WHERE dashboard_id = %s AND document_id = %s",
                            (json.dumps(cv), DASHBOARD_ID, doc_id),
                        )
                    conn.commit()
            except Exception as e:
                logger.warning("Could not mark processing state in DB: %s", e)

            # Execute workflow with retries for rate limits
            max_retries = 3
            backoff = 30
            result = None
            last_err = None

            for attempt in range(max_retries):
                try:
                    usage_list = []
                    ctx = {
                        "service": "workflow_coding",
                        "campaign_id": DASHBOARD_ID,
                        "usage_accumulator": usage_list,
                    }
                    result = await workflow_executor.execute(
                        definition,
                        source_text,
                        model_override=model,
                        log_context=ctx,
                    )
                    break
                except Exception as exc:
                    last_err = exc
                    err_msg = str(exc)
                    if "429" in err_msg or "rate limit" in err_msg.lower() or "quota" in err_msg.lower():
                        wait_sec = backoff * (attempt + 1)
                        logger.warning(
                            "[%d/%d] Rate limited on attempt %d/%d for [%s] %s — waiting %ds...",
                            task_idx, total_tasks, attempt + 1, max_retries, model, filename, wait_sec
                        )
                        await asyncio.sleep(wait_sec)
                    else:
                        logger.error(
                            "[%d/%d] Error running [%s] on %s: %s",
                            task_idx, total_tasks, model, filename, exc
                        )
                        break

            elapsed_ms = int((time.perf_counter() - t0) * 1000)

            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT coded_values, workflow_trace, workflow_context FROM dashboard_documents WHERE dashboard_id = %s AND document_id = %s FOR UPDATE",
                        (DASHBOARD_ID, doc_id),
                    )
                    row = cur.fetchone()
                    cv = row["coded_values"] if row and row["coded_values"] else {}
                    if isinstance(cv, str):
                        cv = json.loads(cv)

                    if result is not None:
                        model_coded = dict(result["outputs"])
                        model_context = result.get("context", {})
                        now_iso = datetime.now(UTC).isoformat().replace("+00:00", "Z")

                        for col in schema_fields:
                            col_name = col.get("name")
                            if not col_name:
                                continue
                            reasoning = extract_reasoning(col_name, col.get("workflow_source"), model_context)
                            if reasoning:
                                model_coded[f"{col_name}_reasoning"] = reasoning
                            val = model_coded.get(col_name)
                            model_coded[f"{col_name}_history"] = [{
                                "version": 1,
                                "value": val,
                                "reasoning": reasoning,
                                "feedback_prompt": None,
                                "timestamp": now_iso,
                                "source": "ai",
                            }]

                        input_tokens = sum(getattr(u, "input_tokens", 0) for u in usage_list if u)
                        output_tokens = sum(getattr(u, "output_tokens", 0) for u in usage_list if u)

                        cv[model] = {
                            "values": model_coded,
                            "status": "completed",
                            "input_tokens": input_tokens,
                            "output_tokens": output_tokens,
                            "error_message": None,
                            "error_type": None,
                            "trace": result["trace"],
                            "context": model_context,
                            "timing": {
                                "started_at": datetime.fromtimestamp(t0, tz=UTC).isoformat().replace("+00:00", "Z"),
                                "completed_at": now_iso,
                                "workflow_execute_ms": elapsed_ms,
                                "total_run_ms": elapsed_ms,
                            },
                        }

                        # Check if all models for this document are completed
                        all_completed = all(
                            cv.get(m, {}).get("status") == "completed"
                            for m in ["gemini-3.1-flash-lite"] + TARGET_MODELS
                        )
                        doc_status = "completed" if all_completed else "processing"

                        cur.execute(
                            """
                            UPDATE dashboard_documents
                            SET coded_values = %s,
                                status = %s
                            WHERE dashboard_id = %s AND document_id = %s
                            """,
                            (json.dumps(cv), doc_status, DASHBOARD_ID, doc_id),
                        )
                        conn.commit()
                        logger.info(
                            "[%d/%d] ✔ COMPLETED [%s] on %s in %ds (cascade=%s, m9=%s, b3=%s)",
                            task_idx, total_tasks, model, filename, elapsed_ms // 1000,
                            model_coded.get("cascade_discretion_rank"),
                            model_coded.get("m9_discretion_rank"),
                            model_coded.get("b3_discretion_rank"),
                        )
                    else:
                        cv[model] = {
                            "values": {},
                            "status": "failed",
                            "error_message": str(last_err)[:1000] if last_err else "Execution failed",
                            "error_type": "EXECUTION_ERROR",
                            "timing": {
                                "started_at": datetime.fromtimestamp(t0, tz=UTC).isoformat().replace("+00:00", "Z"),
                                "completed_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
                                "workflow_execute_ms": elapsed_ms,
                                "total_run_ms": elapsed_ms,
                            },
                        }
                        cur.execute(
                            """
                            UPDATE dashboard_documents
                            SET coded_values = %s
                            WHERE dashboard_id = %s AND document_id = %s
                            """,
                            (json.dumps(cv), DASHBOARD_ID, doc_id),
                        )
                        conn.commit()
                        logger.error(
                            "[%d/%d] ✖ FAILED [%s] on %s: %s",
                            task_idx, total_tasks, model, filename, last_err
                        )


async def main():
    logger.info("Initializing parallel evaluation for dashboard: %s", DASHBOARD_ID)
    
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # 1. Fetch dashboard and workflow definition
            cur.execute("SELECT workflow_definition_json FROM dashboards WHERE id = %s", (DASHBOARD_ID,))
            dash = cur.fetchone()
            if not dash:
                logger.error("Dashboard %s not found!", DASHBOARD_ID)
                return
            definition = json.loads(dash["workflow_definition_json"]) if isinstance(dash["workflow_definition_json"], str) else dash["workflow_definition_json"]
            schema_fields = extract_dashboard_schema_fields(definition)

            # 2. Fetch all 15 documents
            cur.execute("""
                SELECT dd.document_id, dd.coded_values, dd.status,
                       d.filename, d.source_text
                FROM dashboard_documents dd
                JOIN documents d ON dd.document_id = d.id
                WHERE dd.dashboard_id = %s
                ORDER BY d.filename;
            """, (DASHBOARD_ID,))
            docs = [dict(r) for r in cur.fetchall()]

    logger.info("Found %d documents in dashboard.", len(docs))

    # 3. Identify pending tasks across TARGET_MODELS
    tasks_to_run = []
    for doc in docs:
        cv = doc["coded_values"]
        if isinstance(cv, str):
            cv = json.loads(cv)
        elif cv is None:
            cv = {}
        for m in TARGET_MODELS:
            m_status = cv.get(m, {}).get("status")
            if m_status != "completed":
                tasks_to_run.append({
                    "doc": doc,
                    "model": m,
                })

    logger.info("Total tasks to execute: %d (across %d models and %d files)", len(tasks_to_run), len(TARGET_MODELS), len(docs))
    if not tasks_to_run:
        logger.info("All tasks are already completed! Nothing to run.")
        return

    global_sem = asyncio.Semaphore(GLOBAL_CONCURRENCY)
    model_sems = {m: asyncio.Semaphore(MAX_PER_MODEL_CONCURRENCY) for m in TARGET_MODELS}

    coros = [
        evaluate_task(
            global_sem=global_sem,
            model_sem=model_sems[t["model"]],
            doc_info=t["doc"],
            model=t["model"],
            definition=definition,
            schema_fields=schema_fields,
            task_idx=i + 1,
            total_tasks=len(tasks_to_run),
        )
        for i, t in enumerate(tasks_to_run)
    ]

    await asyncio.gather(*coros)
    logger.info("🎉 All %d evaluation tasks finished!", len(tasks_to_run))


if __name__ == "__main__":
    asyncio.run(main())
