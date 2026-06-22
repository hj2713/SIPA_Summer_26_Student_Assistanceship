from fastapi import APIRouter, Query
from typing import Optional
from app.core.deps import CurrentUserDep
from app.repositories import get_db_session

router = APIRouter(prefix="/api/usage", tags=["usage"])

@router.get("/stats")
def get_usage_stats(
    current_user: CurrentUserDep,
    timeframe: str = Query("last_day", enum=["last_hour", "last_day", "last_7_days", "all"]),
    campaign_id: Optional[str] = Query(None),
    thread_id: Optional[str] = Query(None),
):
    """Retrieve summarized, categorized, and timestamped cost & token statistics."""
    with get_db_session() as session:
        return session.usage_logs.get_usage_stats(
            timeframe=timeframe,
            campaign_id=campaign_id,
            thread_id=thread_id
        )
