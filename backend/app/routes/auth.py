import time
import uuid
import jwt
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel

from app.core.config import settings
from app.core.database import hash_password, verify_password
from app.repositories import get_db_session
from app.core.deps import CurrentUserDep
from app.core.llm_credentials import (
    LLMCredentialsResponse,
    LLMCredentialsUpdate,
    get_user_llm_credentials_summary,
    update_user_llm_credentials,
)

import logging
router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)

def is_postgres_session(session) -> bool:
    if settings.DB_PROVIDER.lower() == "postgres":
        return True
    conn_obj = getattr(session, "conn", None)
    if conn_obj:
        conn_str = str(type(conn_obj)).lower()
        return "psycopg" in conn_str or "pg" in conn_str or hasattr(conn_obj, "pg_conn")
    return False

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

    with get_db_session() as session:
        # Check if user already exists
        if session.users.get_by_email(email):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User already registered"
            )
        
        # Create user
        user_id = str(uuid.uuid4())
        pwd_hash = hash_password(password)
        row = session.users.create(
            user_id=user_id,
            email=email,
            password_hash=pwd_hash,
            is_admin=0,
            can_add=0,
            can_delete=0
        )

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

    with get_db_session() as session:
        row = session.users.get_by_email(email)
        
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
    with get_db_session() as session:
        rows = session.users.list_all()
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


class VerifyLLMCredentialsPayload(BaseModel):
    provider: str
    api_key: str
    base_url: str | None = None


class VerifyLLMCredentialsResponse(BaseModel):
    success: bool
    models: list[str]
    error: str | None = None


@router.post("/llm-credentials/verify", response_model=VerifyLLMCredentialsResponse)
async def verify_llm_credentials(
    payload: VerifyLLMCredentialsPayload,
    current_user: CurrentUserDep
):
    """Verify LLM provider credentials by attempting a basic API call, then returning models."""
    import logging
    logger = logging.getLogger(__name__)

    provider = payload.provider.strip().lower()
    api_key = payload.api_key.strip()
    base_url = (payload.base_url or "").strip() or None

    if not api_key:
        return VerifyLLMCredentialsResponse(success=False, models=[], error="API key cannot be empty")

    models = []
    try:
        if provider == "google":
            from google import genai
            from google.genai import types
            client = genai.Client(api_key=api_key)
            # Test call
            await client.aio.models.generate_content(
                model="gemini-2.5-flash",
                contents="Hello",
                config=types.GenerateContentConfig(max_output_tokens=1)
            )
            # List models
            try:
                res = client.models.list()
                models = [m.name.replace("models/", "") for m in res if "gemini" in m.name]
            except Exception:
                models = [
                    "gemini-2.5-flash",
                    "gemini-2.5-pro",
                    "gemini-1.5-flash",
                    "gemini-1.5-pro",
                    "gemini-3.1-flash-lite-preview"
                ]

        elif provider == "anthropic":
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=api_key)
            # Test call
            await client.messages.create(
                model="claude-sonnet-4-5",
                max_tokens=1,
                messages=[{"role": "user", "content": "Ping"}]
            )
            models = [
                "claude-sonnet-5",
                "claude-opus-4.8",
                "claude-opus-4.7",
                "claude-sonnet-4-5",
                "claude-sonnet-4.6",
                "claude-haiku-4.5",
                "claude-3-5-sonnet-latest",
                "claude-3-5-sonnet-20241022",
                "claude-3-5-haiku-latest",
                "claude-3-5-haiku-20241022",
                "claude-3-opus-latest",
                "claude-3-opus-20240229",
                "claude-3-sonnet-20240229",
                "claude-3-haiku-20240307",
            ]

        elif provider == "openai":
            import openai
            client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url)
            # Test call
            await client.chat.completions.create(
                model="gpt-4o-mini",
                max_tokens=1,
                messages=[{"role": "user", "content": "Ping"}]
            )
            # List models
            try:
                res = await client.models.list()
                models = [m.id for m in res.data if any(x in m.id for x in ["gpt-", "o1-", "o3-"])]
            except Exception:
                pass
            if not models:
                models = ["gpt-4o", "gpt-4o-mini", "o1-preview", "o1-mini", "gpt-4-turbo"]

        elif provider in ("openrouter", "deepseek", "kimi"):
            import httpx
            # Verify key using OpenRouter auth check
            async with httpx.AsyncClient() as http_client:
                auth_res = await http_client.get(
                    "https://openrouter.ai/api/v1/auth/key",
                    headers={"Authorization": f"Bearer {api_key}"}
                )
                if auth_res.status_code != 200:
                    return VerifyLLMCredentialsResponse(
                        success=False,
                        models=[],
                        error=f"OpenRouter API key verification failed: {auth_res.text}"
                    )
                
                # Fetch all models
                models_res = await http_client.get("https://openrouter.ai/api/v1/models")
                if models_res.status_code != 200:
                    return VerifyLLMCredentialsResponse(
                        success=False,
                        models=[],
                        error="Failed to fetch models list from OpenRouter"
                    )
                
                all_models = [m["id"] for m in models_res.json()["data"]]
                
                if provider == "deepseek":
                    models = [m for m in all_models if "deepseek" in m.lower()]
                elif provider == "kimi":
                    models = [m for m in all_models if "kimi" in m.lower() or "moonshot" in m.lower()]
                else:
                    models = all_models
        else:
            return VerifyLLMCredentialsResponse(
                success=False,
                models=[],
                error=f"Unsupported provider: '{provider}'"
            )

        # Deduplicate and sort models
        models = sorted(list(set(models)))
        
        # Save verified credential safely to user_llm_credentials in DB
        norm_prov = "gemini" if provider in ("google", "gemini") else ("openrouter" if provider in ("openrouter", "deepseek", "kimi") else provider)
        default_m = models[0] if models else "default"
        try:
            update_user_llm_credentials(
                current_user.id,
                LLMCredentialsUpdate(
                    provider=norm_prov,
                    model=default_m,
                    api_key=api_key,
                    base_url=base_url
                )
            )
            logger.info(f"Verified & saved encrypted API key for user {current_user.id}, provider={norm_prov}")
        except Exception as save_err:
            logger.warning(f"Could not auto-save verified credential: {save_err}")

        return VerifyLLMCredentialsResponse(success=True, models=models)

    except Exception as e:
        logger.exception("LLM Key verification failed")
        return VerifyLLMCredentialsResponse(success=False, models=[], error=str(e))


@router.put("/users/{user_id}/permissions", response_model=UserResponse)
def update_permissions(user_id: str, payload: PermissionsUpdate, current_user: CurrentUserDep):
    """Toggle a user's addition/deletion capabilities. Restricted to admins."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin users can modify user permissions"
        )
    with get_db_session() as session:
        row = session.users.get_by_id(user_id)
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        row = session.users.update(user_id, {
            "can_add": int(payload.can_add),
            "can_delete": int(payload.can_delete)
        })
        return UserResponse(
            id=row["id"],
            email=row["email"],
            is_admin=bool(row["is_admin"]),
            can_add=bool(row["can_add"]),
            can_delete=bool(row["can_delete"])
        )

class GoogleLoginRequest(BaseModel):
    email: str
    token: str | None = None

class LinkGoogleRequest(BaseModel):
    google_email: str

class InviteMemberRequest(BaseModel):
    email: str

@router.post("/google-login", response_model=AuthResponse)
def google_login(payload: GoogleLoginRequest):
    """Sign in or sign up via Google / Supabase Auth."""
    email = payload.email.strip().lower()
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is required for Google login"
        )

    with get_db_session() as session:
        # Check if user already exists
        row = session.users.get_by_email(email)
        
        if not row:
            user_id = str(uuid.uuid4())
            pwd_hash = hash_password(str(uuid.uuid4()))
            row = session.users.create(
                user_id=user_id,
                email=email,
                password_hash=pwd_hash,
                is_admin=0,
                can_add=1,
                can_delete=1
            )

        user_id = row["id"]
        user_email = row["email"]
        is_admin = bool(row["is_admin"])
        can_add = bool(row.get("can_add", 1))
        can_delete = bool(row.get("can_delete", 1))

    token = create_jwt(user_id, user_email)
    user_data = UserResponse(
        id=user_id,
        email=user_email,
        is_admin=is_admin,
        can_add=can_add,
        can_delete=can_delete
    )
    session_data = SessionResponse(access_token=token, user=user_data)
    return AuthResponse(session=session_data, user=user_data)


@router.post("/link-google")
def link_google(payload: LinkGoogleRequest, current_user: CurrentUserDep):
    """Link current account with a Google email."""
    google_email = payload.google_email.strip().lower()
    if not google_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google email cannot be empty"
        )

    user_email = current_user.email or "test@test.com"

    with get_db_session() as session:
        # Check if Google email is already claimed by a dummy user row
        existing_user = session.users.get_by_email(google_email)
        if existing_user and existing_user["id"] != current_user.id:
            try:
                # Re-assign or archive dummy user email
                session.users.update(existing_user["id"], {"email": f"linked_{existing_user['id']}@archived.local"})
            except Exception as e:
                logger.warning("Could not reassign dummy user email: %s", e)

        # Ensure current user row exists and update email alias
        try:
            session.users.update(current_user.id, {"email": google_email})
        except Exception as e:
            logger.warning("Could not update primary user email: %s", e)

    return {
        "status": "success",
        "message": f"Account {user_email} successfully linked with Google account ({google_email}).",
        "user_id": current_user.id,
        "google_email": google_email,
    }


@router.get("/workspaces", response_model=list[WorkspaceResponse])
def list_workspaces(current_user: CurrentUserDep):
    """List available workspaces for the current user based on membership."""
    with get_db_session() as session:
        rows = session.workspaces.list_all()
        valid_rows = [r for r in rows if r["id"] not in ("QA", "TEST") and r["name"] not in ("QA", "TEST")]
        if not valid_rows or not any(r["id"] == "PRODUCTION" for r in valid_rows):
            try:
                session.workspaces.create(workspace_id="PRODUCTION", name="PRODUCTION")
                if not any(r["id"] == "PRODUCTION" for r in valid_rows):
                    valid_rows.append({"id": "PRODUCTION", "name": "PRODUCTION"})
            except Exception:
                pass
        
        # If user is admin (e.g. test@test.com), show all valid workspaces
        if current_user.is_admin:
            return [WorkspaceResponse(id=row["id"], name=row["name"]) for row in valid_rows]
        
        # Non-admin user: check workspace_memberships table
        allowed_ids = set()
        try:
            if hasattr(session, "conn") and session.conn:
                cursor = session.conn.cursor()
                if is_postgres_session(session):
                    cursor.execute(
                        "SELECT workspace_id FROM workspace_memberships WHERE LOWER(user_email) = %s;",
                        (current_user.email.lower(),)
                    )
                else:
                    cursor.execute(
                        "SELECT workspace_id FROM workspace_memberships WHERE LOWER(user_email) = ?;",
                        (current_user.email.lower(),)
                    )
                for r in cursor.fetchall():
                    email_ws = r[0] if isinstance(r, (list, tuple)) else r["workspace_id"]
                    allowed_ids.add(email_ws)
        except Exception as e:
            logger.warning(f"Error checking workspace memberships: {e}")

        member_rows = [r for r in valid_rows if r["id"] in allowed_ids]

        # If user has no workspaces assigned, auto-provision a personal workspace for them
        if not member_rows:
            user_prefix = current_user.email.split("@")[0].upper()
            personal_ws_id = f"WS-{current_user.id[:8].upper()}"
            personal_ws_name = f"{user_prefix}'S WORKSPACE"
            try:
                if not session.workspaces.get_by_id(personal_ws_id):
                    session.workspaces.create(workspace_id=personal_ws_id, name=personal_ws_name)
                
                if hasattr(session, "conn") and session.conn:
                    cursor = session.conn.cursor()
                    m_id = str(uuid.uuid4())
                    if is_postgres_session(session):
                        cursor.execute(
                            "INSERT INTO workspace_memberships (id, workspace_id, user_email) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING;",
                            (m_id, personal_ws_id, current_user.email.lower())
                        )
                    else:
                        cursor.execute(
                            "INSERT OR IGNORE INTO workspace_memberships (id, workspace_id, user_email) VALUES (?, ?, ?);",
                            (m_id, personal_ws_id, current_user.email.lower())
                        )
                return [WorkspaceResponse(id=personal_ws_id, name=personal_ws_name)]
            except Exception as e:
                logger.error(f"Failed to auto-create personal workspace: {e}")

        return [WorkspaceResponse(id=row["id"], name=row["name"]) for row in member_rows]


@router.post("/workspaces", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
def create_workspace(payload: WorkspaceCreate, current_user: CurrentUserDep):
    """Create a new workspace and add creator as member."""
    name = payload.name.strip().upper()
    if not name or name in ("QA", "TEST"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid workspace name"
        )
    
    workspace_id = name
    with get_db_session() as session:
        if session.workspaces.get_by_id(workspace_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Workspace already exists"
            )
        session.workspaces.create(workspace_id=workspace_id, name=name)

        try:
            if hasattr(session, "conn") and session.conn:
                cursor = session.conn.cursor()
                m_id = str(uuid.uuid4())
                if is_postgres_session(session):
                    cursor.execute(
                        "INSERT INTO workspace_memberships (id, workspace_id, user_email) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING;",
                        (m_id, workspace_id, current_user.email.lower())
                    )
                else:
                    cursor.execute(
                        "INSERT OR IGNORE INTO workspace_memberships (id, workspace_id, user_email) VALUES (?, ?, ?);",
                        (m_id, workspace_id, current_user.email.lower())
                    )
        except Exception as e:
            logger.error(f"Failed to save workspace membership: {e}")

    return WorkspaceResponse(id=workspace_id, name=name)


@router.get("/workspaces/active", response_model=WorkspaceResponse)
def get_active_workspace_endpoint(current_user: CurrentUserDep):
    """Get the current active workspace from RAM."""
    from app.core.workspace import get_active_workspace
    active_id = get_active_workspace()
    if active_id in ("QA", "TEST"):
        active_id = "PRODUCTION"
    return WorkspaceResponse(id=active_id, name=active_id)


@router.post("/workspaces/active", response_model=WorkspaceResponse)
def set_active_workspace_endpoint(payload: WorkspaceCreate, current_user: CurrentUserDep):
    """Set the current active workspace in RAM."""
    from app.core.workspace import set_active_workspace
    workspace_id = payload.name.strip().upper()
    if workspace_id in ("QA", "TEST"):
        workspace_id = "PRODUCTION"
    if not workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Workspace name cannot be empty"
        )
    with get_db_session() as session:
        if not session.workspaces.get_by_id(workspace_id):
            session.workspaces.create(workspace_id=workspace_id, name=workspace_id)
    set_active_workspace(workspace_id)
    return WorkspaceResponse(id=workspace_id, name=workspace_id)


@router.get("/workspaces/{workspace_id}/members")
def list_workspace_members(workspace_id: str, current_user: CurrentUserDep):
    """List members and invited accounts for a workspace."""
    ws_id = workspace_id.strip().upper()
    with get_db_session() as session:
        member_emails = set()
        try:
            if hasattr(session, "conn") and session.conn:
                cursor = session.conn.cursor()
                if is_postgres_session(session):
                    cursor.execute("SELECT user_email FROM workspace_memberships WHERE workspace_id = %s;", (ws_id,))
                else:
                    cursor.execute("SELECT user_email FROM workspace_memberships WHERE workspace_id = ?;", (ws_id,))
                for r in cursor.fetchall():
                    email_val = r[0] if isinstance(r, (list, tuple)) else r["user_email"]
                    member_emails.add(email_val.lower())
        except Exception as e:
            logger.warning(f"Error reading workspace members: {e}")

        all_users = session.users.list_all()
        for u in all_users:
            if u.get("is_admin"):
                member_emails.add(u["email"].lower())

        members = []
        for u in all_users:
            if u["email"].lower() in member_emails:
                members.append({
                    "id": u["id"],
                    "email": u["email"],
                    "is_admin": bool(u.get("is_admin", 0)),
                    "can_add": bool(u.get("can_add", 0)),
                    "can_delete": bool(u.get("can_delete", 0)),
                    "role": "Owner/Admin" if u.get("is_admin") else "Member",
                    "status": "Active"
                })
        return members


@router.post("/workspaces/{workspace_id}/invite")
def invite_to_workspace(workspace_id: str, payload: InviteMemberRequest, current_user: CurrentUserDep):
    """Invite a Google / team email to join a workspace (Admin only)."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace administrators can invite team members."
        )
    invite_email = payload.email.strip().lower()
    ws_id = workspace_id.strip().upper()
    if not invite_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email cannot be empty"
        )
    
    with get_db_session() as session:
        # Add to workspace_memberships
        try:
            if hasattr(session, "conn") and session.conn:
                cursor = session.conn.cursor()
                m_id = str(uuid.uuid4())
                if is_postgres_session(session):
                    cursor.execute(
                        "INSERT INTO workspace_memberships (id, workspace_id, user_email) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING;",
                        (m_id, ws_id, invite_email)
                    )
                else:
                    cursor.execute(
                        "INSERT OR IGNORE INTO workspace_memberships (id, workspace_id, user_email) VALUES (?, ?, ?);",
                        (m_id, ws_id, invite_email)
                    )
        except Exception as e:
            logger.error(f"Failed to save workspace membership: {e}")

        # Ensure user account exists (with non-admin default flags)
        user_row = session.users.get_by_email(invite_email)
        if not user_row:
            u_id = str(uuid.uuid4())
            pwd_hash = hash_password(str(uuid.uuid4()))
            session.users.create(
                user_id=u_id,
                email=invite_email,
                password_hash=pwd_hash,
                is_admin=0,
                can_add=0,
                can_delete=0
            )

    # Dispatch email invitation to recipient's inbox
    from app.services.email_service import send_workspace_invite_email
    email_sent = send_workspace_invite_email(invite_email, ws_id, current_user.email)

    msg = f"Successfully invited {invite_email} to workspace {ws_id}."
    if email_sent:
        msg += " Invitation email sent to recipient's inbox."
    else:
        msg += " Membership recorded in workspace."

    return {
        "status": "success",
        "message": msg,
        "workspace_id": ws_id,
        "invited_email": invite_email,
        "email_sent": email_sent
    }


class UpdateUserPermissionsRequest(BaseModel):
    can_add: bool
    can_delete: bool


@router.put("/users/{user_id}/permissions")
def update_user_permissions(user_id: str, payload: UpdateUserPermissionsRequest, current_user: CurrentUserDep):
    """Update can_add and can_delete permissions for a user (Admin only)."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace admins can update user permissions."
        )
    with get_db_session() as session:
        u = session.users.get_by_id(user_id)
        if not u:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        try:
            if hasattr(session, "conn") and session.conn:
                cursor = session.conn.cursor()
                if is_postgres_session(session):
                    cursor.execute(
                        "UPDATE users SET can_add = %s, can_delete = %s WHERE id = %s;",
                        (1 if payload.can_add else 0, 1 if payload.can_delete else 0, user_id)
                    )
                else:
                    cursor.execute(
                        "UPDATE users SET can_add = ?, can_delete = ? WHERE id = ?;",
                        (1 if payload.can_add else 0, 1 if payload.can_delete else 0, user_id)
                    )
        except Exception as e:
            logger.error(f"Failed to update user permissions: {e}")
            raise HTTPException(status_code=500, detail="Failed to update permissions")

    return {"status": "success", "message": "User permissions updated successfully"}


class KeyPreferenceRequest(BaseModel):
    preference: str  # 'USE_PERSONAL_IF_AVAILABLE' | 'USE_WORKSPACE_ONLY' | 'ALWAYS_PERSONAL'


@router.get("/user/key-preference")
def get_user_key_preference(current_user: CurrentUserDep):
    with get_db_session() as session:
        u = session.users.get_by_id(current_user.id)
        pref = "USE_PERSONAL_IF_AVAILABLE"
        if u:
            if isinstance(u, dict):
                pref = u.get("llm_key_preference") or pref
            else:
                pref = getattr(u, "llm_key_preference", None) or pref
        return {"preference": pref}


@router.put("/user/key-preference")
def update_user_key_preference(payload: KeyPreferenceRequest, current_user: CurrentUserDep):
    pref = payload.preference.strip()
    if pref not in ("USE_PERSONAL_IF_AVAILABLE", "USE_WORKSPACE_ONLY", "ALWAYS_PERSONAL"):
        raise HTTPException(status_code=400, detail="Invalid preference value")

    with get_db_session() as session:
        try:
            if hasattr(session, "conn") and session.conn:
                cursor = session.conn.cursor()
                if is_postgres_session(session):
                    cursor.execute("UPDATE users SET llm_key_preference = %s WHERE id = %s;", (pref, current_user.id))
                else:
                    cursor.execute("UPDATE users SET llm_key_preference = ? WHERE id = ?;", (pref, current_user.id))
        except Exception as e:
            logger.error(f"Failed to update key preference: {e}")
            raise HTTPException(status_code=500, detail="Failed to save preference")

    return {"status": "success", "preference": pref}


class WorkspaceLLMCredentialUpdate(BaseModel):
    provider: str
    api_key: str
    model: Optional[str] = None
    base_url: Optional[str] = None


@router.get("/workspaces/{workspace_id}/llm-credentials")
def list_workspace_llm_credentials(workspace_id: str, current_user: CurrentUserDep):
    ws_id = workspace_id.strip().upper()
    credentials = []
    with get_db_session() as session:
        try:
            if hasattr(session, "conn") and session.conn:
                cursor = session.conn.cursor()
                if is_postgres_session(session):
                    cursor.execute(
                        "SELECT id, provider, api_key_encrypted, model, base_url, updated_at FROM workspace_llm_credentials WHERE workspace_id = %s;",
                        (ws_id,)
                    )
                else:
                    cursor.execute(
                        "SELECT id, provider, api_key_encrypted, model, base_url, updated_at FROM workspace_llm_credentials WHERE workspace_id = ?;",
                        (ws_id,)
                    )
                for row in cursor.fetchall():
                    prov = row[1] if isinstance(row, (list, tuple)) else row["provider"]
                    enc = row[2] if isinstance(row, (list, tuple)) else row["api_key_encrypted"]
                    mod = row[3] if isinstance(row, (list, tuple)) else row.get("model")
                    base = row[4] if isinstance(row, (list, tuple)) else row.get("base_url")
                    
                    from app.core.llm_credentials import decrypt_api_key
                    raw_key = decrypt_api_key(enc) if enc else ""
                    masked = (raw_key[:6] + "..." + raw_key[-4:]) if len(raw_key) > 10 else ("***" if raw_key else "")
                    
                    credentials.append({
                        "provider": prov,
                        "is_configured": bool(raw_key),
                        "masked_key": masked,
                        "model": mod,
                        "base_url": base
                    })
        except Exception as e:
            logger.warning(f"Error fetching workspace credentials: {e}")
    return {"workspace_id": ws_id, "credentials": credentials}


@router.post("/workspaces/{workspace_id}/llm-credentials/verify")
def verify_and_save_workspace_llm_credential(workspace_id: str, payload: WorkspaceLLMCredentialUpdate, current_user: CurrentUserDep):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Only workspace admins can configure workspace API keys.")
    
    ws_id = workspace_id.strip().upper()
    provider = payload.provider.strip().lower()
    raw_key = payload.api_key.strip()
    
    from app.core.llm_credentials import verify_provider_api_key, encrypt_api_key
    ok, err = verify_provider_api_key(provider, raw_key, payload.model, payload.base_url)
    if not ok:
        raise HTTPException(status_code=400, detail=err or "API Key verification failed.")
    
    encrypted = encrypt_api_key(raw_key)
    c_id = str(uuid.uuid4())
    
    with get_db_session() as session:
        try:
            if hasattr(session, "conn") and session.conn:
                cursor = session.conn.cursor()
                if is_postgres_session(session):
                    cursor.execute(
                        """
                        INSERT INTO workspace_llm_credentials (id, workspace_id, provider, api_key_encrypted, model, base_url, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                        ON CONFLICT (workspace_id, provider) 
                        DO UPDATE SET api_key_encrypted = EXCLUDED.api_key_encrypted, model = EXCLUDED.model, base_url = EXCLUDED.base_url, updated_at = CURRENT_TIMESTAMP;
                        """,
                        (c_id, ws_id, provider, encrypted, payload.model, payload.base_url)
                    )
                else:
                    cursor.execute(
                        """
                        INSERT INTO workspace_llm_credentials (id, workspace_id, provider, api_key_encrypted, model, base_url, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                        ON CONFLICT(workspace_id, provider) 
                        DO UPDATE SET api_key_encrypted = excluded.api_key_encrypted, model = excluded.model, base_url = excluded.base_url, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
                        """,
                        (c_id, ws_id, provider, encrypted, payload.model, payload.base_url)
                    )
        except Exception as e:
            logger.error(f"Failed to save workspace credential: {e}")
            raise HTTPException(status_code=500, detail="Failed to save workspace credential")
            
    return {"status": "success", "message": f"Successfully verified and saved workspace {provider} key."}


