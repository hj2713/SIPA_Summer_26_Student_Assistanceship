from fastapi import APIRouter, Query
from typing import Optional
from app.core.deps import CurrentUserDep
from app.core.database import get_db_conn
import datetime

router = APIRouter(prefix="/api/usage", tags=["usage"])

@router.get("/stats")
async def get_usage_stats(
    current_user: CurrentUserDep,
    timeframe: str = Query("last_day", enum=["last_hour", "last_day", "last_7_days", "all"]),
    campaign_id: Optional[str] = Query(None),
    thread_id: Optional[str] = Query(None),
):
    """Retrieve summarized, categorized, and timestamped cost & token statistics."""
    conditions = []
    params = {}

    # Timeframe filter
    if timeframe == "last_hour":
        conditions.append("timestamp >= datetime('now', '-1 hour')")
    elif timeframe == "last_day":
        conditions.append("timestamp >= datetime('now', '-24 hours')")
    elif timeframe == "last_7_days":
        conditions.append("timestamp >= datetime('now', '-7 days')")

    # Scope filters
    if campaign_id:
        conditions.append("campaign_id = :campaign_id")
        params["campaign_id"] = campaign_id
    if thread_id:
        conditions.append("thread_id = :thread_id")
        params["thread_id"] = thread_id

    where_clause = ""
    if conditions:
        where_clause = "WHERE " + " AND ".join(conditions)

    # 1. Summary
    summary_query = f"""
        SELECT 
            COALESCE(SUM(input_tokens), 0) as input_tokens,
            COALESCE(SUM(output_tokens), 0) as output_tokens,
            COALESCE(SUM(calculated_cost), 0.0) as total_cost,
            COUNT(*) as total_calls
        FROM llm_usage_logs
        {where_clause}
    """

    # 2. Breakdown
    breakdown_query = f"""
        SELECT 
            provider,
            model,
            COALESCE(SUM(input_tokens), 0) as input_tokens,
            COALESCE(SUM(output_tokens), 0) as output_tokens,
            COALESCE(SUM(calculated_cost), 0.0) as cost,
            COUNT(*) as calls
        FROM llm_usage_logs
        {where_clause}
        GROUP BY provider, model
        ORDER BY cost DESC
    """

    # 3. Timeline
    # Determine bucket granularity
    if timeframe in ("last_hour", "last_day"):
        bucket_format = "%Y-%m-%dT%H:00:00Z"
    else:
        bucket_format = "%Y-%m-%dZ"

    timeline_query = f"""
        SELECT 
            strftime('{bucket_format}', timestamp) as time_bucket,
            COALESCE(SUM(calculated_cost), 0.0) as cost,
            COUNT(*) as calls
        FROM llm_usage_logs
        {where_clause}
        GROUP BY time_bucket
        ORDER BY time_bucket ASC
    """

    with get_db_conn() as conn:
        cursor = conn.cursor()
        
        # Run Summary
        cursor.execute(summary_query, params)
        sum_row = cursor.fetchone()
        summary = {
            "input_tokens": sum_row["input_tokens"],
            "output_tokens": sum_row["output_tokens"],
            "total_cost": sum_row["total_cost"],
            "total_calls": sum_row["total_calls"]
        }

        # Run Breakdown
        cursor.execute(breakdown_query, params)
        breakdown_rows = cursor.fetchall()
        breakdown = [dict(r) for r in breakdown_rows]

        # Run Timeline
        cursor.execute(timeline_query, params)
        timeline_rows = cursor.fetchall()
        timeline = [dict(r) for r in timeline_rows]

    return {
        "summary": summary,
        "breakdown": breakdown,
        "timeline": timeline,
    }
