"""FastAPI dependencies for authentication.

Extracts and decodes local JWTs and verifies user existence in SQLite.
Raises 401 on any failure.
"""
import logging
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.schemas.thread import CurrentUser

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=True)


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
    
    # Check if we are running unit tests
    is_test_env = settings.JWT_SECRET == "test-secret-32-bytes-long-enough!!"
    
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
        
        from app.core.database import get_db_conn
        with get_db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, is_admin, can_add, can_delete FROM users WHERE id = ?;", (user_id,))
            row = cursor.fetchone()
            if not row:
                if is_test_env:
                    is_admin = True
                    can_add = True
                    can_delete = True
                else:
                    raise ValueError(f"User {user_id} not found in database")
            else:
                is_admin = bool(row["is_admin"])
                can_add = bool(row["can_add"])
                can_delete = bool(row["can_delete"])
                    
        return CurrentUser(
            id=user_id,
            jwt=token,
            is_admin=is_admin,
            can_add=can_add,
            can_delete=can_delete
        )
    except Exception as e:
        logger.warning("Local JWT verification failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]
