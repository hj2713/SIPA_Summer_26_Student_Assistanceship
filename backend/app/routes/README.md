# Backend API Routes Architecture & Documentation

This directory contains the FastAPI route handlers (`APIRouter`) for the Law Delegation application. All endpoints follow REST principles, enforce JSON request/response models, and apply strict workspace isolation.

---

## 📁 Directory Structure & Route Modules

| File | Route Prefix | Primary Responsibilities & Features |
| :--- | :--- | :--- |
| [`auth.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/routes/auth.py) | `/api/auth` | User authentication, registration, JWT issuance, Google OAuth linking, workspace creation, listing, invitations, workspace member role queries, and workspace LLM API key management. |
| [`dashboards.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/routes/dashboards.py) | `/api/dashboards` | Campaign dashboard lifecycle (create, list, get, update, delete), document linking/unlinking, cell-level & row-level LLM re-evaluations, model comparisons, and benchmark evaluations. |
| [`documents.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/routes/documents.py) | `/api/documents` | Workspace-scoped document upload, content hashing & deduplication, background ingestion (PDF parsing, chunking, embedding), metadata tag updates, and pagination. |
| [`workflows.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/routes/workflows.py) | `/api/workflows` | Coding workflow builder endpoints: workflow drafts, templates, versioning, publishing, execution, duplicate, export/import, and linking workflows to research campaign dashboards. |
| [`chat.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/routes/chat.py) | `/api/chat` | AI research assistant chat streaming endpoints (RAG over workspace documents and structured campaign extraction summaries). |
| [`threads.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/routes/threads.py) | `/api/threads` | Conversation thread management: listing user threads, retrieving message histories, updating titles, and deleting active threads. |
| [`usage.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/routes/usage.py) | `/api/usage` | LLM token consumption tracking, per-workspace/user cost aggregation summaries, and log reporting. |
| [`health.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/routes/health.py) | `/health` | System readiness & database connectivity health checks. |

---

## 🛡️ Workspace Isolation & Security Architecture

### 1. Per-Workspace Ownership Model
- **Workspaces** represent strict multi-tenant boundaries. Every workspace has an explicit owner (`created_by`), and access is granted exclusively through the `workspace_memberships` table.
- **No Global Admin Bypass**: There is no global admin that can automatically view or modify resources in other users' workspaces. Admin privileges (`owner`/`admin`) are scoped strictly per-workspace.

### 2. Mandatory Workspace Authorization Helpers
All endpoints verifying workspace access use standard guard functions defined in [`auth.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/routes/auth.py) and [`dashboards.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/routes/dashboards.py):

- **Workspace Membership Guard**: `_require_workspace_member(session, workspace_id, user_email)` ensures the requesting user has an active membership record in the target workspace.
- **Workspace Admin Guard**: `_require_workspace_admin(session, workspace_id, user_email)` checks if the user's role is `'owner'` or `'admin'` within that workspace (e.g. for inviting team members or setting workspace API keys).
- **Campaign Workspace Scoping Guard**: `_verify_campaign_workspace(campaign_id, workspace_id)` verifies that the target campaign dashboard actually belongs to the active `workspace_id` passed by header/dependency. If a user tries to access a campaign ID belonging to another workspace, a `403 Forbidden` exception is raised.

---

## 🔑 Dependency Injection & Authentication Flow

Routes use FastAPI dependency injection (`Depends`) to resolve authentication context:
1. `current_user: CurrentUserDep` — Decodes the incoming Bearer JWT, validates expiration, and yields the authenticated user's model.
2. `workspace_id: str = Depends(get_workspace_id)` — Extracts the active workspace context from the `X-Workspace-ID` header (falling back to default).

---

## ⚙️ Example Route Scoping Pattern

When implementing or extending endpoints, always follow this pattern:

```python
@router.get("/{id}", response_model=DashboardRow)
def get_campaign(
    id: str,
    current_user: CurrentUserDep,
    workspace_id: str = Depends(get_workspace_id)
):
    # 1. Enforce workspace isolation
    _verify_campaign_workspace(id, workspace_id)
    
    # 2. Execute business logic
    return campaign_service.get_campaign(id)
```
