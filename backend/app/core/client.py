"""Per-request local client wrapper representing the authenticated user context."""
import jwt

from app.core.config import settings
from app.core.constants import DEFAULT_WORKSPACE_ID


class UserClient:
    """Minimal client identity wrapper passed through service-layer calls."""
    user_id: str
    workspace_id: str

    def __init__(self, user_id: str, workspace_id: str = None) -> None:
        self.user_id = user_id
        if workspace_id is None:
            from app.core.workspace import get_active_workspace
            workspace_id = get_active_workspace()
        self.workspace_id = workspace_id


def get_user_client(user_jwt: str, workspace_id: str = None) -> UserClient:
    """Return a user client wrapping the user ID decoded from JWT and the workspace ID."""
    if workspace_id is None:
        from app.core.workspace import get_active_workspace
        workspace_id = get_active_workspace()
    try:
        payload = jwt.decode(
            user_jwt,
            settings.JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        return UserClient(payload.get("sub", ""), workspace_id)
    except Exception:
        return UserClient("", workspace_id)
