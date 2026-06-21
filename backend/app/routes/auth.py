import time
import uuid
import jwt
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel

from app.core.config import settings
from app.core.database import get_db_conn, hash_password, verify_password
from app.core.deps import CurrentUserDep
from app.core.llm_credentials import (
    LLMCredentialsResponse,
    LLMCredentialsUpdate,
    get_user_llm_credentials_summary,
    update_user_llm_credentials,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

class AuthRequest(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    is_admin: bool = False
    can_add: bool = False
    can_delete: bool = False

class SessionResponse(BaseModel):
    access_token: str
    user: UserResponse

class AuthResponse(BaseModel):
    session: SessionResponse
    user: UserResponse

class PermissionsUpdate(BaseModel):
    can_add: bool
    can_delete: bool

class WorkspaceResponse(BaseModel):
    id: str
    name: str

class WorkspaceCreate(BaseModel):
    name: str

def create_jwt(user_id: str, email: str) -> str:
    """Generate a JWT token for local authentication."""
    now = int(time.time())
    payload = {
        "sub": user_id,
        "email": email,
        "iat": now,
        "exp": now + (30 * 24 * 3600)  # 30 days
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")

@router.post("/signup", response_model=AuthResponse)
def signup(payload: AuthRequest, current_user: CurrentUserDep):
    """Create a new user. Restricted to admin users only."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin users can create new users"
        )

    email = payload.email.strip().lower()
    password = payload.password
    
    if len(password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long"
        )

    with get_db_conn() as conn:
        # Check if user already exists
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE email = ?;", (email,))
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User already registered"
            )
        
        # Create user
        user_id = str(uuid.uuid4())
        pwd_hash = hash_password(password)
        conn.execute(
            "INSERT INTO users (id, email, password_hash, is_admin, can_add, can_delete) VALUES (?, ?, ?, 0, 0, 0);",
            (user_id, email, pwd_hash)
        )
        conn.commit()

        cursor.execute("SELECT * FROM users WHERE id = ?;", (user_id,))
        row = cursor.fetchone()

    token = create_jwt(user_id, email)
    user_data = UserResponse(
        id=user_id,
        email=email,
        is_admin=bool(row["is_admin"]),
        can_add=bool(row["can_add"]),
        can_delete=bool(row["can_delete"])
    )
    session_data = SessionResponse(access_token=token, user=user_data)
    return AuthResponse(session=session_data, user=user_data)

@router.post("/login", response_model=AuthResponse)
def login(payload: AuthRequest):
    email = payload.email.strip().lower()
    password = payload.password

    with get_db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ?;", (email,))
        row = cursor.fetchone()
        
        if not row or not verify_password(password, row["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        user_id = row["id"]
        is_admin = bool(row["is_admin"])
        can_add = bool(row["can_add"])
        can_delete = bool(row["can_delete"])

    token = create_jwt(user_id, email)
    user_data = UserResponse(
        id=user_id,
        email=email,
        is_admin=is_admin,
        can_add=can_add,
        can_delete=can_delete
    )
    session_data = SessionResponse(access_token=token, user=user_data)
    return AuthResponse(session=session_data, user=user_data)

@router.get("/users", response_model=list[UserResponse])
def list_users(current_user: CurrentUserDep):
    """Retrieve all registered users and their permissions. Restricted to admins."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin users can access the user registry"
        )
    with get_db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, email, is_admin, can_add, can_delete FROM users ORDER BY email ASC;")
        rows = cursor.fetchall()
        return [
            UserResponse(
                id=row["id"],
                email=row["email"],
                is_admin=bool(row["is_admin"]),
                can_add=bool(row["can_add"]),
                can_delete=bool(row["can_delete"])
            )
            for row in rows
        ]

@router.get("/llm-credentials", response_model=LLMCredentialsResponse)
def read_llm_credentials(current_user: CurrentUserDep):
    """Return the current user's LLM settings without exposing the API key."""
    return get_user_llm_credentials_summary(current_user.id)

@router.put("/llm-credentials", response_model=LLMCredentialsResponse)
def save_llm_credentials(payload: LLMCredentialsUpdate, current_user: CurrentUserDep):
    """Save encrypted LLM settings for the current user."""
    try:
        return update_user_llm_credentials(current_user.id, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

@router.put("/users/{user_id}/permissions", response_model=UserResponse)
def update_permissions(user_id: str, payload: PermissionsUpdate, current_user: CurrentUserDep):
    """Toggle a user's addition/deletion capabilities. Restricted to admins."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin users can modify user permissions"
        )
    with get_db_conn() as conn:
        conn.execute(
            "UPDATE users SET can_add = ?, can_delete = ? WHERE id = ?;",
            (int(payload.can_add), int(payload.can_delete), str(user_id))
        )
        conn.commit()
        
        cursor = conn.cursor()
        cursor.execute("SELECT id, email, is_admin, can_add, can_delete FROM users WHERE id = ?;", (str(user_id),))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        return UserResponse(
            id=row["id"],
            email=row["email"],
            is_admin=bool(row["is_admin"]),
            can_add=bool(row["can_add"]),
            can_delete=bool(row["can_delete"])
        )

@router.get("/workspaces", response_model=list[WorkspaceResponse])
def list_workspaces(current_user: CurrentUserDep):
    """List all available workspaces."""
    with get_db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM workspaces ORDER BY name ASC;")
        rows = cursor.fetchall()
        return [WorkspaceResponse(id=row["id"], name=row["name"]) for row in rows]

@router.post("/workspaces", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
def create_workspace(payload: WorkspaceCreate, current_user: CurrentUserDep):
    """Create a new workspace."""
    name = payload.name.strip().upper()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Workspace name cannot be empty"
        )
    
    workspace_id = name
    with get_db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM workspaces WHERE id = ?;", (workspace_id,))
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Workspace already exists"
            )
        conn.execute("INSERT INTO workspaces (id, name) VALUES (?, ?);", (workspace_id, name))
        conn.commit()

    return WorkspaceResponse(id=workspace_id, name=name)
