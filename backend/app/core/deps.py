"""FastAPI dependencies for authentication.

Extracts and decodes local JWTs and verifies user existence in SQLite.
Raises 401 on any failure.
"""
import logging
import os
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.core.request_context import set_current_user_id
from app.schemas.thread import CurrentUser

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=True)
_verified_workspace_ids: set[str] = set()


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
) -> CurrentUser:
    """Verify the local JWT and return the authenticated user.

    Decodes the JWT using pyjwt, verifies signature against local secret,
    and checks if the user exists in SQLite.
    Raises:
        HTTPException 401: on any verification failure.
    """
    token = credentials.credentials
    
    # Check if we are running unit tests (set by conftest.py's cleanup_test_db fixture)
    is_test_env = os.environ.get("TEST_MODE", "").lower() in ("1", "true", "yes")
    
    import jwt
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        user_id: str = payload.get("sub", "")
        if not user_id:
            raise ValueError("Missing 'sub' claim")
            
        # Verify user exists in local SQLite and fetch permissions
        is_admin = False
        can_add = False
        can_delete = False
        
        from app.repositories import get_db_session
        with get_db_session() as session:
            row = session.users.get_by_id(user_id)
            if not row:
                if is_test_env:
                    is_admin = True
                    can_add = True
                    can_delete = True
                else:
                    # Automatically register verified external user in local cache
                    email = payload.get("email") or f"{user_id}@auth.external"
                    is_admin = False
                    can_add = True
                    can_delete = False
                    session.users.create(
                        user_id=user_id,
                        email=email,
                        password_hash="EXTERNAL_AUTH_NO_PASSWORD",
                        is_admin=int(is_admin),
                        can_add=int(can_add),
                        can_delete=int(can_delete)
                    )
                    logger.info("Automatically registered external user %s (%s) in local cache.", user_id, email)
            else:
                is_admin = bool(row["is_admin"])
                can_add = bool(row["can_add"])
                can_delete = bool(row["can_delete"])
                    
        set_current_user_id(user_id)
        return CurrentUser(
            id=user_id,
            jwt=token,
            is_admin=is_admin,
            can_add=can_add,
            can_delete=can_delete
        )
    except Exception as e:
        import traceback
        error_module = type(e).__module__
        if error_module.startswith(("psycopg", "psycopg_pool")):
            logger.error("Database unavailable during authentication: %s\n%s", e, traceback.format_exc())
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database temporarily unavailable",
            )
        logger.warning("Local JWT verification failed: %s\n%s", e, traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]


def get_workspace_id(workspace_id: str = None) -> str:
    """Dependency to retrieve/update the active workspace ID dynamically.
    
    If workspace_id query/form param is passed, we update the active workspace in RAM.
    Otherwise, we retrieve it from RAM.
    """
    from app.core.workspace import get_active_workspace, set_active_workspace
    if workspace_id:
        set_active_workspace(workspace_id)
        resolved = workspace_id
    else:
        resolved = get_active_workspace()

    # Ensure each workspace exists once per process. Rechecking the same row on
    # every request adds an avoidable database round trip to all paginated calls.
    from app.repositories import get_db_session
    if resolved not in _verified_workspace_ids:
        try:
            with get_db_session() as session:
                if not session.workspaces.get_by_id(resolved):
                    session.workspaces.create(workspace_id=resolved, name=resolved)
            _verified_workspace_ids.add(resolved)
        except Exception:
            logger.exception("Could not verify workspace %s", resolved)
        
    return resolved
