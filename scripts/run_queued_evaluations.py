#!/usr/bin/env python3
"""
run_queued_evaluations.py
─────────────────────────
Locally executes all queued dashboard_documents for a given dashboard_id
by running the workflow executor directly (5 files in parallel).

Connects to Supabase PostgreSQL, reads source_text from documents table,
runs the workflow, and writes results back — exactly the same logic the
Render server uses but running on your local machine.
"""
import asyncio
import json
import sys
import os
import datetime
import time
import logging

# ── bootstrap the backend path ──────────────────────────────────────────────
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND = os.path.join(ROOT, "backend")
sys.path.insert(0, BACKEND)

# Force PostgreSQL + Supabase storage
os.environ.setdefault("DB_PROVIDER", "postgres")
os.environ.setdefault("STORAGE_PROVIDER", "supabase")

from app.core.config import settings
from app.workflows.executor import workflow_executor
from app.workflows.schema_fields import extract_dashboard_schema_fields
import psycopg
import psycopg.rows

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("run_queued_evaluations")

# ── config ──────────────────────────────────────────────────────────────────
DASHBOARD_ID   = "37a604aa-693e-4945-a89c-5df41b127710"
CONCURRENCY    = 3       # files running in parallel (3×~5 nodes ≈ 15 req/min free-tier limit)
MAX_FILES      = None    # set to e.g. 10 to test, None = run all

# ── db helpers ───────────────────────────────────────────────────────────────
def get_conn():
    return psycopg.connect(
        settings.DATABASE_URL,
        prepare_threshold=None,
        row_factory=psycopg.rows.dict_row,
    )

def fetch_dashboard(conn, dashboard_id: str) -> dict:
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM dashboards WHERE id = %s;", (dashboard_id,))
        row = cur.fetchone()
        if not row:
            raise SystemExit(f"Dashboard {dashboard_id} not found!")
        return dict(row)

def fetch_queued_docs(conn, dashboard_id: str) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT dd.document_id, dd.coded_values,
                   d.filename, d.source_text
            FROM dashboard_documents dd
            JOIN documents d ON dd.document_id = d.id
            WHERE dd.dashboard_id = %s
              AND dd.status IN ('pending', 'queued')
            ORDER BY dd.created_at;
            """,
            (dashboard_id,),
        )
        return [dict(r) for r in cur.fetchall()]

def mark_processing(conn, dashboard_id: str, document_id: str):
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE dashboard_documents SET status = 'processing' WHERE dashboard_id = %s AND document_id = %s;",
            (dashboard_id, document_id),
        )
    conn.commit()

def save_result(
    conn,
    dashboard_id: str,
    document_id: str,
    coded_values: dict,
    trace: list,
    context: dict,
    status: str,
    error_message: str | None = None,
    error_type: str | None = None,
):
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE dashboard_documents
            SET coded_values     = %s,
                workflow_trace   = %s,
                workflow_context = %s,
                status           = %s,
                error_message    = %s,
                error_type       = %s
            WHERE dashboard_id = %s AND document_id = %s;
            """,
            (
                json.dumps(coded_values),
                json.dumps(trace),
                json.dumps(context),
                status,
                error_message,
                error_type,
                dashboard_id,
                document_id,
            ),
        )
    conn.commit()

# ── reasoning extractor (mirrors workflow_dashboard_service) ─────────────────
def extract_reasoning(col_name: str, workflow_source: str | None, model_context: dict) -> str | None:
    if not workflow_source:
        return None
    parts = str(workflow_source).split(".")
    node_id = parts[0]
    field_name = parts[1] if len(parts) > 1 else node_id
    candidates = [
        f"{node_id}.{field_name}_reasoning", f"{node_id}.{field_name}_rationale",
        f"{node_id}.{field_name}_explanation", f"{node_id}.{col_name}_reasoning",
        f"{node_id}.{col_name}_rationale",     f"{node_id}.{col_name}_explanation",
        f"{node_id}.reasoning", f"{node_id}.rationale",
        f"{field_name}_reasoning", f"{field_name}_rationale",
        f"{col_name}_reasoning",  f"{col_name}_rationale",
    ]
    for c in candidates:
        if c in model_context and model_context[c]:
            return str(model_context[c])
    # broader search
    for k, v in model_context.items():
        if k.startswith(node_id + ".") and "reason" in k.lower() and v:
            return str(v)
    return None

# ── per-file runner ───────────────────────────────────────────────────────────
async def run_one_document(
    sem: asyncio.Semaphore,
    doc: dict,
    dashboard_id: str,
    definition: dict,
    schema_fields: list,
    model: str,
    total: int,
    idx: int,
) -> None:
    doc_id   = doc["document_id"]
    filename = os.path.basename(doc["filename"])
    source_text = doc.get("source_text") or ""

    if not source_text.strip():
        logger.warning("[%d/%d] SKIP %s — no source_text in database", idx, total, filename)
        # mark failed so it doesn't stay queued forever
        conn = get_conn()
        try:
            save_result(conn, dashboard_id, doc_id, {}, [], {},
                        status="failed",
                        error_message="source_text is empty — file text not populated in database.",
                        error_type="MISSING_TEXT")
        finally:
            conn.close()
        return

    async with sem:
        t0 = time.perf_counter()
        logger.info("[%d/%d] START  %s (doc=%s)", idx, total, filename, doc_id)

        # mark processing in DB
        conn = get_conn()
        try:
            mark_processing(conn, dashboard_id, doc_id)
        finally:
            conn.close()

        try:
            usage_list: list = []
            ctx = {
                "service": "workflow_coding",
                "campaign_id": dashboard_id,
                "usage_accumulator": usage_list,
            }

            # retry on rate-limit 429 errors
            max_retries = 6
            backoff = 45  # seconds to wait on first 429
            result = None
            last_exc = None
            for attempt in range(max_retries):
                try:
                    usage_list.clear()
                    result = await workflow_executor.execute(
                        definition,
                        source_text,
                        model_override=model,
                        log_context=ctx,
                    )
                    break  # success
                except Exception as exc:
                    last_exc = exc
                    msg = str(exc)
                    if "429" in msg or "RESOURCE_EXHAUSTED" in msg or "quota" in msg.lower():
                        wait = backoff * (attempt + 1)
                        logger.warning(
                            "[%d/%d] Rate-limited on attempt %d/%d for %s — waiting %ds before retry…",
                            idx, total, attempt + 1, max_retries, filename, wait,
                        )
                        await asyncio.sleep(wait)
                    else:
                        raise  # non-rate-limit error: fail immediately

            if result is None:
                raise last_exc

            model_coded: dict = dict(result["outputs"])
            model_context: dict = result.get("context", {})

            # enrich with reasoning + history
            now_iso = datetime.datetime.now(datetime.UTC).isoformat() + "Z"
            for col in schema_fields:
                col_name = col.get("name")
                if not col_name:
                    continue
                reasoning = extract_reasoning(col_name, col.get("workflow_source"), model_context)
                if reasoning:
                    model_coded[f"{col_name}_reasoning"] = reasoning
                val = model_coded.get(col_name)
                model_coded[f"{col_name}_history"] = [{
                    "version": 1, "value": val, "reasoning": reasoning,
                    "feedback_prompt": None, "timestamp": now_iso, "source": "ai",
                }]

            input_tokens  = sum(getattr(u, "input_tokens",  0) for u in usage_list if u)
            output_tokens = sum(getattr(u, "output_tokens", 0) for u in usage_list if u)

            elapsed_ms = int((time.perf_counter() - t0) * 1000)

            started_iso  = datetime.datetime.fromtimestamp(t0, tz=datetime.UTC).isoformat() + "Z"
            now_utc      = datetime.datetime.now(datetime.UTC)
            completed_iso = now_utc.isoformat() + "Z"

            timing = {
                "queued_at":            None,
                "started_at":           started_iso,
                "completed_at":         completed_iso,
                "queue_wait_ms":        None,
                "source_text_load_ms":  0,
                "workflow_execute_ms":  elapsed_ms,
                "total_run_ms":         elapsed_ms,
            }

            # build coded_values identical to how the server saves it
            all_coded = {
                model: {
                    "values":        model_coded,
                    "status":        "completed",
                    "input_tokens":  input_tokens,
                    "output_tokens": output_tokens,
                    "error_message": None,
                    "error_type":    None,
                    "trace":         result["trace"],
                    "context":       model_context,
                    "timing":        timing,
                }
            }
            logger.info(
                "[%d/%d] DONE   %s  tokens=%d+%d  time=%ds",
                idx, total, filename, input_tokens, output_tokens, elapsed_ms // 1000,
            )

            conn = get_conn()
            try:
                save_result(
                    conn, dashboard_id, doc_id,
                    all_coded, result["trace"], model_context,
                    status="completed",
                )
            finally:
                conn.close()

        except Exception as exc:
            elapsed_ms = int((time.perf_counter() - t0) * 1000)
            logger.error("[%d/%d] FAIL   %s — %s  (%dms)", idx, total, filename, exc, elapsed_ms)
            conn = get_conn()
            try:
                save_result(
                    conn, dashboard_id, doc_id, {}, [], {},
                    status="failed",
                    error_message=str(exc)[:2000],
                    error_type="API_FAILURE",
                )
            finally:
                conn.close()

# ── main ──────────────────────────────────────────────────────────────────────
async def main():
    if not settings.DATABASE_URL:
        raise SystemExit("DATABASE_URL is not configured — check .env / environment.")

    conn = get_conn()
    logger.info("Connected to Supabase PostgreSQL. Fetching dashboard…")

    dash     = fetch_dashboard(conn, DASHBOARD_ID)
    queued   = fetch_queued_docs(conn, DASHBOARD_ID)
    conn.close()

    if not queued:
        logger.info("No queued documents found for dashboard %s — nothing to do.", DASHBOARD_ID)
        return

    if MAX_FILES:
        queued = queued[:MAX_FILES]

    model = dash.get("model") or "gemini-3.1-flash-lite"
    model = [m.strip() for m in model.split(",") if m.strip()][0]

    definition_json = dash.get("workflow_definition_json") or "{}"
    definition = json.loads(definition_json) if isinstance(definition_json, str) else definition_json
    schema_fields = extract_dashboard_schema_fields(definition)

    total = len(queued)
    logger.info(
        "Dashboard: %s | Model: %s | Schema fields: %s | Files to process: %d | Concurrency: %d",
        dash.get("name"), model, [c.get("name") for c in schema_fields], total, CONCURRENCY,
    )

    sem   = asyncio.Semaphore(CONCURRENCY)
    tasks = [
        run_one_document(sem, doc, DASHBOARD_ID, definition, schema_fields, model, total, i + 1)
        for i, doc in enumerate(queued)
    ]

    t_start = time.perf_counter()
    await asyncio.gather(*tasks)
    elapsed = time.perf_counter() - t_start

    logger.info(
        "ALL DONE — processed %d files in %.1fs (avg %.1fs each)",
        total, elapsed, elapsed / max(total, 1),
    )

if __name__ == "__main__":
    asyncio.run(main())
