#!/usr/bin/env python3
"""
scripts/run_benchmark_evaluations.py
───────────────────────────────────
Robust autonomous evaluator for the full 169-law legal benchmark across models:
- gemini-3.1-flash-lite (or gemini-3.5-flash)
- deepseek/deepseek-chat
- qwen/qwen3-235b-a22b-2507
- moonshotai/kimi-k2.5
- openai/gpt-oss-120b

Runs both:
1. Staged DAG Workflow (40 nodes: delegation gate, attributes, cascade, m9, b3)
2. Single-Pass Baseline (unconstrained direct prediction of discretion rank 0-4)

Features:
- Zero duplication: skips already-completed tasks.
- If staged workflow is done but baseline is missing, runs only the baseline.
- Rate-limit resilient with exponential backoff on 429s.
- Real-time updates directly to Supabase dashboard_documents.coded_values.
- Atomic row-locking and persistent status tracking.
"""

import os
import sys
import json
import time
import asyncio
import logging
from datetime import UTC, datetime
from pydantic import BaseModel, Field

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
from app.llm.registry import get_llm_for_model
from app.llm.types import LLMMessage
import psycopg
from psycopg.rows import dict_row

LOG_DIR = os.path.join(ROOT_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "benchmark_run.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_FILE, mode="a", encoding="utf-8"),
    ]
)
logger = logging.getLogger("benchmark_eval")

DEFAULT_DASHBOARD_ID = "c45796b6-18b5-46ad-a805-4066fec7feaf"

ALL_TARGET_MODELS = [
    "gemini-3.1-flash-lite",
    "deepseek/deepseek-v3.2-exp",
    "qwen/qwen3-235b-a22b-2507",
    "moonshotai/kimi-k2.5",
    "openai/gpt-oss-120b",
]

MAX_PER_MODEL_CONCURRENCY = 2
GLOBAL_CONCURRENCY = 6


class SinglePassBaselineOutput(BaseModel):
    single_pass_discretion_rank: int = Field(
        ...,
        ge=0,
        le=4,
        description="Overall Rough Guide Discretion Rank (0 to 4): 0=No Discretion (no delegation), 1=Minimal, 2=Limited, 3=Substantial, 4=High.",
    )
    single_pass_rationale: str = Field(
        ...,
        description="Concise rationale for the assigned discretion rank based directly on the law text.",
    )


def get_db_connection():
    for attempt in range(5):
        try:
            return psycopg.connect(
                settings.DATABASE_URL,
                prepare_threshold=None,
                row_factory=dict_row,
            )
        except Exception as e:
            if attempt < 4:
                time.sleep(2 * (attempt + 1))
            else:
                raise


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


async def run_single_pass_baseline(model: str, source_text: str, log_context: dict | None = None) -> dict:
    llm = get_llm_for_model(model)
    messages = [
        LLMMessage(
            role="system",
            content=(
                "You are an expert legal coding analyst evaluating U.S. federal statutory text for administrative discretion.\n"
                "Directly classify the law into an overall Rough Guide discretion rank from 0 to 4:\n"
                "  0 = No Discretion: No delegation of authority exists.\n"
                "  1 = Minimal Discretion: Narrow, mechanical, procedural, ministerial, or tightly constrained authority.\n"
                "  2 = Limited Discretion: Real authority exists, but bounded by significant statutory constraints, reporting, or standards.\n"
                "  3 = Substantial Discretion: Meaningful authority to interpret, implement, supervise, or set standards, leaving significant room for judgment.\n"
                "  4 = High Discretion: Broad, unconstrained policymaking, rulemaking, or enforcement authority with few meaningful constraints.\n\n"
                "Directly evaluate the provided text without intermediate attribute classifications. Return single_pass_discretion_rank (0 to 4) and single_pass_rationale as clean JSON without any preamble or conversational commentary."
            ),
        ),
        LLMMessage(
            role="user",
            content=f"Statutory Text to evaluate:\n\n{source_text[:60000]}",
        ),
    ]
    parsed = await llm.parse_structured(messages, SinglePassBaselineOutput, log_context=log_context)
    return parsed.model_dump()


async def evaluate_task(
    dashboard_id: str,
    model_sem: asyncio.Semaphore,
    doc_info: dict,
    model: str,
    definition: dict,
    schema_fields: list,
    task_idx: int,
    total_tasks: int,
    need_staged: bool,
    need_baseline: bool,
):
    doc_id = doc_info["document_id"]
    filename = os.path.basename(doc_info["filename"])
    source_text = doc_info.get("source_text")

    async with model_sem:
        t0 = time.perf_counter()

        # Fetch source_text if needed and mark in DB that this model is processing (single connection)
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    if not source_text:
                        cur.execute("SELECT source_text FROM documents WHERE id = %s", (doc_id,))
                        r = cur.fetchone()
                        source_text = r["source_text"] if r else ""

                    cur.execute(
                        "SELECT coded_values FROM dashboard_documents WHERE dashboard_id = %s AND document_id = %s FOR UPDATE",
                        (dashboard_id, doc_id),
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
                        (json.dumps(cv), dashboard_id, doc_id),
                    )
                conn.commit()
        except Exception as e:
            logger.warning("Could not mark processing state in DB: %s", e)

        action_desc = "STAGED+BASELINE" if (need_staged and need_baseline) else ("BASELINE-ONLY" if need_baseline else "STAGED-ONLY")
        logger.info(
            "[%s] [%d/%d] ▶ START (%s) on %s (chars=%d)",
            model, task_idx, total_tasks, action_desc, filename, len(source_text or "")
        )

        max_retries = 3
        backoff = 10
        staged_result = None
        baseline_result = None
        last_err = None
        usage_list = []
        ctx = {
            "service": "workflow_coding",
            "campaign_id": dashboard_id,
            "usage_accumulator": usage_list,
        }

        # 1. Run Staged Workflow if needed
        if need_staged:
            for attempt in range(max_retries):
                try:
                    staged_result = await workflow_executor.execute(
                        definition,
                        source_text,
                        model_override=model,
                        log_context=ctx,
                    )
                    break
                except Exception as exc:
                    last_err = exc
                    err_msg = str(exc)
                    if any(k in err_msg.lower() for k in ["402", "in_flight", "in-flight", "credit", "payment required"]):
                        wait_sec = 60 * (attempt + 1)
                        logger.warning(
                            "[%s] [%d/%d] In-flight budget full / 402 (staged) attempt %d/%d for %s — waiting %ds for in-flight requests to settle...",
                            model, task_idx, total_tasks, attempt + 1, max_retries, filename, wait_sec
                        )
                        await asyncio.sleep(wait_sec)
                    elif any(k in err_msg.lower() for k in ["429", "503", "rate limit", "quota", "unavailable", "demand", "connection", "nodename", "timeout"]):
                        wait_sec = backoff * (attempt + 1)
                        logger.warning(
                            "[%s] [%d/%d] Transient error/rate limit (staged) attempt %d/%d for %s — waiting %ds (%s)...",
                            model, task_idx, total_tasks, attempt + 1, max_retries, filename, wait_sec, exc
                        )
                        await asyncio.sleep(wait_sec)
                    else:
                        logger.error(
                            "[%s] [%d/%d] Error running staged on %s: %s",
                            model, task_idx, total_tasks, filename, exc
                        )
                        break


        # 2. Run Single-Pass Baseline if needed
        if need_baseline:
            for attempt in range(max_retries):
                try:
                    baseline_result = await asyncio.wait_for(
                        run_single_pass_baseline(
                            model, source_text, log_context=ctx
                        ),
                        timeout=180.0,
                    )
                    break
                except asyncio.TimeoutError:
                    last_err = TimeoutError("Baseline execution timed out after 180s")
                    wait_sec = backoff * (attempt + 1)
                    logger.warning(
                        "[%s] [%d/%d] Timeout (baseline) attempt %d/%d for %s — retrying after %ds...",
                        model, task_idx, total_tasks, attempt + 1, max_retries, filename, wait_sec
                    )
                    await asyncio.sleep(wait_sec)
                except Exception as exc:
                    last_err = exc
                    err_msg = str(exc)
                    if any(k in err_msg.lower() for k in ["402", "in_flight", "in-flight", "credit", "payment required"]):
                        wait_sec = 60 * (attempt + 1)
                        logger.warning(
                            "[%s] [%d/%d] In-flight budget full / 402 (baseline) attempt %d/%d for %s — waiting %ds for in-flight requests to settle...",
                            model, task_idx, total_tasks, attempt + 1, max_retries, filename, wait_sec
                        )
                        await asyncio.sleep(wait_sec)
                    elif any(k in err_msg.lower() for k in ["429", "503", "rate limit", "quota", "unavailable", "demand", "connection", "nodename"]):
                        wait_sec = backoff * (attempt + 1)
                        logger.warning(
                            "[%s] [%d/%d] Rate limited/Service unavailable (baseline) attempt %d/%d for %s — waiting %ds...",
                            model, task_idx, total_tasks, attempt + 1, max_retries, filename, wait_sec
                        )
                        await asyncio.sleep(wait_sec)
                    else:
                        logger.error(
                            "[%s] [%d/%d] Error running baseline on %s: %s",
                            model, task_idx, total_tasks, filename, exc
                        )
                        break

        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        now_iso = datetime.now(UTC).isoformat().replace("+00:00", "Z")

        # 3. Persist results in DB
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT coded_values, status FROM dashboard_documents WHERE dashboard_id = %s AND document_id = %s FOR UPDATE",
                    (dashboard_id, doc_id),
                )
                row = cur.fetchone()
                cv = row["coded_values"] if row and row["coded_values"] else {}
                if isinstance(cv, str):
                    cv = json.loads(cv)

                existing_m = cv.get(model, {})
                if not existing_m and model == "deepseek/deepseek-v3.2-exp":
                    existing_m = cv.get("deepseek/deepseek-chat", {})
                existing_vals = dict(existing_m.get("values", {}))

                is_success = False

                if need_staged:
                    if staged_result is not None:
                        model_coded = dict(staged_result["outputs"])
                        model_context = staged_result.get("context", {})

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

                        # Preserve existing baseline if already present
                        if "single_pass_discretion_rank" in existing_vals:
                            model_coded["single_pass_discretion_rank"] = existing_vals["single_pass_discretion_rank"]
                            model_coded["single_pass_rationale"] = existing_vals.get("single_pass_rationale")
                            model_coded["single_pass_discretion_rank_history"] = existing_vals.get("single_pass_discretion_rank_history", [])

                        if baseline_result:
                            model_coded["single_pass_discretion_rank"] = baseline_result["single_pass_discretion_rank"]
                            model_coded["single_pass_rationale"] = baseline_result["single_pass_rationale"]
                            model_coded["single_pass_discretion_rank_history"] = [{
                                "version": 1,
                                "value": baseline_result["single_pass_discretion_rank"],
                                "reasoning": baseline_result["single_pass_rationale"],
                                "feedback_prompt": None,
                                "timestamp": now_iso,
                                "source": "ai_single_pass",
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
                            "trace": staged_result.get("trace", []),
                            "context": model_context,
                            "timing": {
                                "started_at": datetime.fromtimestamp(t0, tz=UTC).isoformat().replace("+00:00", "Z"),
                                "completed_at": now_iso,
                                "workflow_execute_ms": elapsed_ms,
                                "total_run_ms": elapsed_ms,
                            },
                        }
                        is_success = True
                else:
                    # Baseline only update
                    if baseline_result is not None:
                        existing_vals["single_pass_discretion_rank"] = baseline_result["single_pass_discretion_rank"]
                        existing_vals["single_pass_rationale"] = baseline_result["single_pass_rationale"]
                        existing_vals["single_pass_discretion_rank_history"] = [{
                            "version": 1,
                            "value": baseline_result["single_pass_discretion_rank"],
                            "reasoning": baseline_result["single_pass_rationale"],
                            "feedback_prompt": None,
                            "timestamp": now_iso,
                            "source": "ai_single_pass",
                        }]
                        if model not in cv:
                            cv[model] = {}
                        cv[model]["values"] = existing_vals
                        cv[model]["status"] = "completed"
                        is_success = True

                if not is_success:
                    if model not in cv:
                        cv[model] = {}
                    cv[model] = {
                        "values": existing_vals,
                        "status": "failed",
                        "error_message": str(last_err)[:1000] if last_err else "Execution failed",
                        "error_type": "EXECUTION_ERROR",
                        "timing": {
                            "started_at": datetime.fromtimestamp(t0, tz=UTC).isoformat().replace("+00:00", "Z"),
                            "completed_at": now_iso,
                            "workflow_execute_ms": elapsed_ms,
                            "total_run_ms": elapsed_ms,
                        },
                    }
                    logger.error(
                        "[%d/%d] ✖ FAILED [%s] on %s: %s",
                        task_idx, total_tasks, model, filename, last_err
                    )

                # Update doc status
                all_completed = True
                for m in ALL_TARGET_MODELS:
                    m_dict = cv.get(m, {})
                    if not m_dict and m == "deepseek/deepseek-v3.2-exp":
                        m_dict = cv.get("deepseek/deepseek-chat", {})
                    if m_dict.get("status") != "completed" or "cascade_discretion_rank" not in m_dict.get("values", {}):
                        all_completed = False
                        break
                doc_status = "completed" if all_completed else "processing"

                cur.execute(
                    """
                    UPDATE dashboard_documents
                    SET coded_values = %s,
                        status = %s
                    WHERE dashboard_id = %s AND document_id = %s
                    """,
                    (json.dumps(cv), doc_status, dashboard_id, doc_id),
                )
                conn.commit()

                if is_success:
                    vals = cv[model]["values"]
                    logger.info(
                        "[%d/%d] ✔ COMPLETED [%s] on %s in %ds (cascade=%s, m9=%s, b3=%s, baseline=%s)",
                        task_idx, total_tasks, model, filename, elapsed_ms // 1000,
                        vals.get("cascade_discretion_rank"),
                        vals.get("m9_discretion_rank"),
                        vals.get("b3_discretion_rank"),
                        vals.get("single_pass_discretion_rank"),
                    )


async def run_benchmark(dashboard_id: str = DEFAULT_DASHBOARD_ID, active_models: list[str] | None = None):
    models = active_models or ALL_TARGET_MODELS
    logger.info("Starting benchmark runner for dashboard %s with models: %s", dashboard_id, models)

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT workflow_definition_json FROM dashboards WHERE id = %s", (dashboard_id,))
            dash = cur.fetchone()
            if not dash:
                logger.error("Dashboard %s not found!", dashboard_id)
                return
            definition = json.loads(dash["workflow_definition_json"]) if isinstance(dash["workflow_definition_json"], str) else dash["workflow_definition_json"]
            schema_fields = extract_dashboard_schema_fields(definition)

            cur.execute("""
                SELECT dd.document_id, d.filename, dd.status,
                       (dd.coded_values::jsonb->'deepseek/deepseek-v3.2-exp'->'values'->>'cascade_discretion_rank') as v32_cascade,
                       (dd.coded_values::jsonb->'deepseek/deepseek-v3.2-exp'->'values'->>'single_pass_discretion_rank') as v32_baseline,
                       (dd.coded_values::jsonb->'deepseek/deepseek-chat'->'values'->>'cascade_discretion_rank') as chat_cascade,
                       (dd.coded_values::jsonb->'deepseek/deepseek-chat'->'values'->>'single_pass_discretion_rank') as chat_baseline,
                       (dd.coded_values::jsonb->'moonshotai/kimi-k2.5'->'values'->>'cascade_discretion_rank') as kimi_cascade,
                       (dd.coded_values::jsonb->'moonshotai/kimi-k2.5'->'values'->>'single_pass_discretion_rank') as kimi_baseline,
                       (dd.coded_values::jsonb->'openai/gpt-oss-120b'->'values'->>'cascade_discretion_rank') as gpt_cascade,
                       (dd.coded_values::jsonb->'openai/gpt-oss-120b'->'values'->>'single_pass_discretion_rank') as gpt_baseline,
                       (dd.coded_values::jsonb->'qwen/qwen3-235b-a22b-2507'->'values'->>'cascade_discretion_rank') as qwen_cascade,
                       (dd.coded_values::jsonb->'qwen/qwen3-235b-a22b-2507'->'values'->>'single_pass_discretion_rank') as qwen_baseline,
                       (dd.coded_values::jsonb->'gemini-3.1-flash-lite'->'values'->>'cascade_discretion_rank') as gemini_cascade,
                       (dd.coded_values::jsonb->'gemini-3.1-flash-lite'->'values'->>'single_pass_discretion_rank') as gemini_baseline
                FROM dashboard_documents dd
                JOIN documents d ON dd.document_id = d.id
                WHERE dd.dashboard_id = %s
                ORDER BY d.filename;
            """, (dashboard_id,))
            docs = [dict(r) for r in cur.fetchall()]

    logger.info("Loaded %d documents in dashboard %s.", len(docs), dashboard_id)

    tasks_to_run = []
    for doc in docs:
        for m in models:
            if m in ("deepseek/deepseek-v3.2-exp", "deepseek/deepseek-chat"):
                has_staged = (doc.get("v32_cascade") is not None) or (doc.get("chat_cascade") is not None)
                has_baseline = (doc.get("v32_baseline") is not None) or (doc.get("chat_baseline") is not None)
            elif m == "moonshotai/kimi-k2.5":
                has_staged = doc.get("kimi_cascade") is not None
                has_baseline = doc.get("kimi_baseline") is not None
            elif m == "openai/gpt-oss-120b":
                has_staged = doc.get("gpt_cascade") is not None
                has_baseline = doc.get("gpt_baseline") is not None
            elif m == "qwen/qwen3-235b-a22b-2507":
                has_staged = doc.get("qwen_cascade") is not None
                has_baseline = doc.get("qwen_baseline") is not None
            elif "gemini" in m:
                has_staged = doc.get("gemini_cascade") is not None
                has_baseline = doc.get("gemini_baseline") is not None
            else:
                has_staged = False
                has_baseline = False

            if has_staged and has_baseline:
                # Completely done!
                continue

            need_staged = not has_staged
            need_baseline = not has_baseline

            tasks_to_run.append({
                "doc": doc,
                "model": m,
                "need_staged": need_staged,
                "need_baseline": need_baseline,
            })

    logger.info("Total tasks identified: %d across %d models and %d documents.", len(tasks_to_run), len(models), len(docs))
    staged_count = sum(1 for t in tasks_to_run if t["need_staged"])
    baseline_count = sum(1 for t in tasks_to_run if t["need_baseline"])
    logger.info("  Tasks requiring staged workflow: %d", staged_count)
    logger.info("  Tasks requiring baseline run: %d", baseline_count)

    # Decouple completely by model so no model ever blocks or starves another model
    model_tasks = {m: [] for m in models}
    for t in tasks_to_run:
        model_tasks[t["model"]].append(t)

    async def run_for_model(model_name: str, tasks: list):
        if not tasks:
            logger.info("🎉 [%s] All tasks already completed!", model_name)
            return
        # Run concurrency 1 for all models under Option B to avoid OpenRouter in-flight credit reservations
        concurrency = 1
        sem = asyncio.Semaphore(concurrency)
        logger.info("🚀 [%s] Starting queue with %d tasks (concurrency=%d)", model_name, len(tasks), concurrency)

        async def _run_one(t_info, idx):
            try:
                await evaluate_task(
                    dashboard_id=dashboard_id,
                    model_sem=sem,
                    doc_info=t_info["doc"],
                    model=model_name,
                    definition=definition,
                    schema_fields=schema_fields,
                    task_idx=idx,
                    total_tasks=len(tasks),
                    need_staged=t_info["need_staged"],
                    need_baseline=t_info["need_baseline"],
                )
            except Exception as e:
                logger.error("[%s] [%d/%d] Task failed with unexpected error: %s", model_name, idx, len(tasks), e)

        await asyncio.gather(*[_run_one(t, i + 1) for i, t in enumerate(tasks)])
        logger.info("🏁 [%s] All %d tasks finished!", model_name, len(tasks))

    await asyncio.gather(*[run_for_model(m, model_tasks[m]) for m in models])
    logger.info("🎉 All %d benchmark evaluation tasks finished across all models!", len(tasks_to_run))


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dashboard", default=DEFAULT_DASHBOARD_ID)
    parser.add_argument("--models", nargs="*", default=None)
    args = parser.parse_args()

    asyncio.run(run_benchmark(dashboard_id=args.dashboard, active_models=args.models))
