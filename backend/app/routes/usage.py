from fastapi import APIRouter, Query
from typing import Optional, Literal
from app.core.deps import CurrentUserDep
from app.repositories import get_db_session

from app.core.workspace import get_active_workspace

router = APIRouter(prefix="/api/usage", tags=["usage"])

@router.get("/stats")
def get_usage_stats(
    current_user: CurrentUserDep,
    timeframe: Literal["last_hour", "last_day", "last_7_days", "all"] = Query("last_day"),
    campaign_id: Optional[str] = Query(None),
    thread_id: Optional[str] = Query(None),
    scope: Optional[Literal["personal", "workspace", "personal_in_workspace"]] = Query("personal"),
):
    """Retrieve isolated summarized, categorized, and timestamped cost & token statistics."""
    active_workspace_id = get_active_workspace()
    with get_db_session() as session:
        return session.usage_logs.get_usage_stats(
            timeframe=timeframe,
            campaign_id=campaign_id,
            thread_id=thread_id,
            user_id=current_user.id,
            workspace_id=active_workspace_id,
            scope=scope
        )
