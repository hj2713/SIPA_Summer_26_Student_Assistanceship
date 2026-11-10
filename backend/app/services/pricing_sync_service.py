"""Model Pricing Synchronization and Accounting Service.

Manages:
1. Local Database Model Pricing Matrix (storing token rates in DB instead of hardcoded).
2. Weekly / On-Demand Sync from Community-Maintained LiteLLM Pricing JSON.
3. Prompt Caching Discount Calculations.
4. Real-time OpenRouter Generation Cost Reconciliation.
"""
import os
import logging
import datetime
import httpx
from typing import Any, Dict, Optional, Tuple

from app.core.config import settings
from app.core.database import get_db_conn

logger = logging.getLogger(__name__)

LITELLM_PRICING_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"
OPENROUTER_GENERATION_URL = "https://openrouter.ai/api/v1/generation"

# Supported provider filters to keep the DB lean and fast
SUPPORTED_PROVIDERS = {"openai", "anthropic", "gemini", "google", "deepseek", "mistral", "meta-llama", "qwen", "openrouter"}


def seed_default_model_pricing() -> int:
    """Seed model_pricing DB table with initial default rates if empty."""
    from app.llm.registry import PRICING_MAP

    seeded = 0
    try:
        with get_db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM model_pricing;")
            row = cursor.fetchone()
            count = row[0] if row else 0
            if count > 0:
                return 0

            placeholder = "%s" if settings.DB_PROVIDER == "postgres" else "?"
            for model_id, (in_p, out_p) in PRICING_MAP.items():
                provider = "google" if "gemini" in model_id else (
                    "openai" if any(p in model_id for p in ["gpt", "o1", "o3", "o4"]) else (
                        "anthropic" if "claude" in model_id else "openrouter"
                    )
                )
                cache_read_p = round(in_p * 0.25, 4)  # Default 75% prompt caching discount
                query = f"""
                    INSERT INTO model_pricing (
                        model_id, provider, input_cost_per_million, output_cost_per_million, cache_read_input_cost_per_million, source
                    ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, 'default')
                """
                if settings.DB_PROVIDER == "postgres":
                    query += " ON CONFLICT (model_id) DO NOTHING;"
                else:
                    query = query.replace("INSERT INTO", "INSERT OR IGNORE INTO")

                cursor.execute(query, (model_id, provider, in_p, out_p, cache_read_p))
                seeded += 1

            conn.commit()
            logger.info("Seeded %d default model prices into database.", seeded)
    except Exception as e:
        logger.warning("Could not seed default model pricing: %s", e)
    return seeded


async def sync_litellm_model_pricing(force: bool = False) -> Dict[str, Any]:
    """Fetch community-maintained LiteLLM model pricing JSON and update DB.

    Strictly checks for price differences: only updates if prices actually changed.
    """
    if os.environ.get("TEST_MODE") == "1" and not force:
        return {"status": "skipped_test_mode", "updated": 0, "inserted": 0, "unchanged": 0}

    logger.info("Starting LiteLLM model pricing sync from %s", LITELLM_PRICING_URL)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(LITELLM_PRICING_URL)
            if resp.status_code != 200:
                logger.error("Failed to fetch LiteLLM pricing: HTTP %s", resp.status_code)
                return {"error": f"HTTP {resp.status_code}", "updated": 0, "inserted": 0}
            data: dict[str, Any] = resp.json()
    except Exception as exc:
        logger.error("Network error fetching LiteLLM model pricing: %s", exc)
        return {"error": str(exc), "updated": 0, "inserted": 0}

    inserted = 0
    updated = 0
    unchanged = 0

    try:
        with get_db_conn() as conn:
            cursor = conn.cursor()
            placeholder = "%s" if settings.DB_PROVIDER == "postgres" else "?"

            # Fetch existing prices into a map
            cursor.execute("SELECT model_id, input_cost_per_million, output_cost_per_million, cache_read_input_cost_per_million FROM model_pricing;")
            existing_rows = cursor.fetchall()
            existing_map: dict[str, Tuple[float, float, float]] = {}
            for r in existing_rows:
                rd = dict(r) if hasattr(r, "keys") else (r if isinstance(r, dict) else {})
                if rd:
                    mid = str(rd["model_id"])
                    inp = float(rd["input_cost_per_million"])
                    outp = float(rd["output_cost_per_million"])
                    c_inp = float(rd.get("cache_read_input_cost_per_million") or inp * 0.25)
                elif isinstance(r, (tuple, list)):
                    mid = str(r[0])
                    inp = float(r[1])
                    outp = float(r[2])
                    c_inp = float(r[3]) if r[3] is not None else round(inp * 0.25, 4)
                else:
                    continue
                existing_map[mid.lower()] = (inp, outp, c_inp)

            for raw_model_name, meta in data.items():
                if not isinstance(meta, dict):
                    continue

                litellm_prov = str(meta.get("litellm_provider", "")).lower()
                # Clean model name (strip litellm provider prefixes like "openai/gpt-4o")
                clean_name = raw_model_name.lower()
                if "/" in clean_name:
                    clean_name = clean_name.split("/")[-1]

                input_per_token = meta.get("input_cost_per_token")
                output_per_token = meta.get("output_cost_per_token")
                if input_per_token is None or output_per_token is None:
                    continue

                new_input_cost_per_million = round(float(input_per_token) * 1_000_000.0, 4)
                new_output_cost_per_million = round(float(output_per_token) * 1_000_000.0, 4)

                cache_read_token = meta.get("cache_read_input_token_cost")
                if cache_read_token is not None:
                    new_cache_cost_per_million = round(float(cache_read_token) * 1_000_000.0, 4)
                else:
                    new_cache_cost_per_million = round(new_input_cost_per_million * 0.25, 4)

                # Determine provider
                provider = "google" if "gemini" in clean_name else (
                    "anthropic" if "claude" in clean_name else (
                        "openai" if ("gpt" in clean_name or clean_name.startswith("o1") or clean_name.startswith("o3") or clean_name.startswith("o4")) else (
                            litellm_prov or "openrouter"
                        )
                    )
                )

                if clean_name in existing_map:
                    cur_in, cur_out, cur_cache = existing_map[clean_name]
                    # Check if prices actually changed (delta tolerance 0.0001)
                    if (
                        abs(cur_in - new_input_cost_per_million) > 1e-4
                        or abs(cur_out - new_output_cost_per_million) > 1e-4
                        or abs(cur_cache - new_cache_cost_per_million) > 1e-4
                    ):
                        # ONLY update if prices changed
                        cursor.execute(
                            f"""
                            UPDATE model_pricing
                            SET input_cost_per_million = {placeholder},
                                output_cost_per_million = {placeholder},
                                cache_read_input_cost_per_million = {placeholder},
                                source = 'litellm',
                                updated_at = {'CURRENT_TIMESTAMP' if settings.DB_PROVIDER == 'postgres' else "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"}
                            WHERE LOWER(model_id) = {placeholder};
                            """,
                            (new_input_cost_per_million, new_output_cost_per_million, new_cache_cost_per_million, clean_name),
                        )
                        updated += 1
                        existing_map[clean_name] = (new_input_cost_per_million, new_output_cost_per_million, new_cache_cost_per_million)
                    else:
                        unchanged += 1
                else:
                    # New model entry
                    insert_sql = f"""
                        INSERT INTO model_pricing (
                            model_id, provider, input_cost_per_million, output_cost_per_million, cache_read_input_cost_per_million, source
                        ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, 'litellm')
                    """
                    if settings.DB_PROVIDER == "postgres":
                        insert_sql += " ON CONFLICT (model_id) DO NOTHING;"
                    else:
                        insert_sql = insert_sql.replace("INSERT INTO", "INSERT OR IGNORE INTO")

                    cursor.execute(
                        insert_sql,
                        (clean_name, provider, new_input_cost_per_million, new_output_cost_per_million, new_cache_cost_per_million),
                    )
                    inserted += 1
                    existing_map[clean_name] = (new_input_cost_per_million, new_output_cost_per_million, new_cache_cost_per_million)

            conn.commit()

            # Flush in-memory pricing cache so new rates take effect immediately
            from app.llm.registry import invalidate_pricing_cache
            invalidate_pricing_cache()

            logger.info("LiteLLM pricing sync completed: %d updated, %d inserted, %d unchanged.", updated, inserted, unchanged)
            return {
                "status": "success",
                "updated": updated,
                "inserted": inserted,
                "unchanged": unchanged,
                "total_models_checked": len(data),
            }

    except Exception as exc:
        logger.error("Error committing LiteLLM model prices to DB: %s", exc)
        return {"error": str(exc), "updated": updated, "inserted": inserted}


async def check_and_run_weekly_sync() -> Optional[Dict[str, Any]]:
    """Check if last pricing sync was > 7 days ago. If so, runs the sync job."""
    if os.environ.get("TEST_MODE") == "1":
        return None

    try:
        with get_db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT MAX(updated_at) FROM model_pricing WHERE source = 'litellm';")
            row = cursor.fetchone()
            last_sync_str = row[0] if row else None

            needs_sync = False
            if not last_sync_str:
                needs_sync = True
            else:
                try:
                    # Parse timestamp
                    cleaned = str(last_sync_str).replace("Z", "+00:00")
                    last_sync = datetime.datetime.fromisoformat(cleaned)
                    if last_sync.tzinfo is None:
                        last_sync = last_sync.replace(tzinfo=datetime.timezone.utc)
                    now = datetime.datetime.now(datetime.timezone.utc)
                    if (now - last_sync).total_seconds() > (7 * 86400):  # 7 days
                        needs_sync = True
                except Exception:
                    needs_sync = True

            if needs_sync:
                logger.info("Model pricing is missing or older than 7 days. Running scheduled weekly sync...")
                return await sync_litellm_model_pricing()
            else:
                logger.info("Model pricing is up to date (last sync: %s).", last_sync_str)
                return None
    except Exception as e:
        logger.warning("Error checking weekly pricing sync status: %s", e)
        return None


async def reconcile_openrouter_cost(
    generation_id: str,
    api_key: Optional[str] = None
) -> Optional[float]:
    """Reconcile exact generation cost directly from OpenRouter's generation endpoint.

    Updates llm_usage_logs with cent-accurate actual billed cost.
    """
    if not generation_id or not generation_id.startswith("gen-"):
        return None

    # Retrieve OpenRouter key from settings or BYOK if not passed
    token = api_key or getattr(settings, "OPENROUTER_API_KEY", None)
    if not token:
        return None

    url = f"{OPENROUTER_GENERATION_URL}?id={generation_id}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
            if resp.status_code != 200:
                logger.warning("OpenRouter generation lookup returned HTTP %s for %s", resp.status_code, generation_id)
                return None

            data = resp.json().get("data", {})
            total_cost = data.get("total_cost")
            if total_cost is not None:
                cost_float = float(total_cost)
                # Reconcile in DB
                with get_db_conn() as conn:
                    placeholder = "%s" if settings.DB_PROVIDER == "postgres" else "?"
                    conn.execute(
                        f"UPDATE llm_usage_logs SET calculated_cost = {placeholder} WHERE generation_id = {placeholder};",
                        (cost_float, generation_id),
                    )
                    conn.commit()
                logger.info("Reconciled exact OpenRouter cost for generation %s: $%f", generation_id, cost_float)
                return cost_float
    except Exception as e:
        logger.warning("Failed to reconcile OpenRouter generation cost for %s: %s", generation_id, e)

    return None
