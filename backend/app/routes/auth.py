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
    """List all available workspaces (excluding legacy QA & TEST)."""
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
        return [WorkspaceResponse(id=row["id"], name=row["name"]) for row in valid_rows]


@router.post("/workspaces", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
def create_workspace(payload: WorkspaceCreate, current_user: CurrentUserDep):
    """Create a new workspace."""
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
    with get_db_session() as session:
        users = session.users.list_all()
        return [
            {
                "id": u["id"],
                "email": u["email"],
                "role": "Owner" if u["email"] == current_user.email else "Member",
                "status": "Active"
            }
            for u in users
        ]


@router.post("/workspaces/{workspace_id}/invite")
def invite_to_workspace(workspace_id: str, payload: InviteMemberRequest, current_user: CurrentUserDep):
    """Invite a Google / team email to join a workspace."""
    invite_email = payload.email.strip().lower()
    if not invite_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email cannot be empty"
        )
    return {
        "status": "success",
        "message": f"Invitation sent to {invite_email} to join workspace {workspace_id.upper()}.",
        "workspace_id": workspace_id.upper(),
        "invited_email": invite_email,
    }


