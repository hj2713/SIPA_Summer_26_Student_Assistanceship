# Core Infrastructure & Configuration Architecture

This directory contains core system primitives, database initializations, dependency injection providers, security utilities, and multi-tenant workspace context resolvers.

---

## 📁 Directory Structure & Modules

| File | Primary Responsibilities |
| :--- | :--- |
| [`config.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/core/config.py) | Application configuration via Pydantic `BaseSettings`. Loads environment variables (`.env`), DB settings, JWT secrets, and LLM provider defaults. |
| [`database.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/core/database.py) | Database schemas, connection pooling (Postgres via Psycopg3 / SQLite), table creation DDLs, index definitions, schema migration checks, and password hashing (`pbkdf2`). |
| [`deps.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/core/deps.py) | FastAPI dependency injection providers: `get_current_user` (JWT validation), `get_workspace_id` (resolves active workspace from headers or request state), and `get_user_client`. |
| [`workspace.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/core/workspace.py) | Active workspace RAM context state (`active_workspace_id`) and helper routines for workspace header resolution. |
| [`llm_credentials.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/core/llm_credentials.py) | AES-256 string encryption & decryption for user and workspace API keys, verification of keys against external LLM providers (Google, OpenAI, Anthropic, OpenRouter). |
| [`llm_resolver.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/core/llm_resolver.py) | Dynamic key resolution hierarchy: determines whether to use personal user API keys, workspace-level keys, or system fallback keys based on user preferences. |
| [`client.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/core/client.py) | Standard client wrapper constructing backend context for service interactions. |
| [`constants.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/core/constants.py) | Application constants: max file sizes, default workspace IDs, pagination limits. |
| [`prompts.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/core/prompts.py) | System prompts for structured law extraction, metadata generation, and chat RAG synthesis. |
| [`vectors.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/core/vectors.py) | In-memory and pgvector embedding calculation and cosine similarity search utilities. |
| [`request_context.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/core/request_context.py) | ContextVars storing request-scoped metadata for context propagation across async threads. |
| [`main.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/core/main.py) | FastAPI application factory, CORS middleware configuration, exception handlers, and route inclusion. |

---

## 🔒 Security & Workspace Resolution Model

### 1. Database Schema & Multi-Tenancy Architecture
- `workspaces`: Represents individual tenant containers (`id`, `name`, `created_by`, `created_at`).
- `workspace_memberships`: Maps users to workspaces (`id`, `workspace_id`, `user_email`, `role`). Roles include:
  - `'owner'`: The workspace creator. Full administrative and workspace management rights.
  - `'admin'`: Workspace administrator invited by the owner. Can invite members and manage workspace API keys.
  - `'member'`: Team member. Can view and modify documents/campaigns within the workspace.

### 2. LLM Key Resolution Order (`llm_resolver.py`)
When an AI operation is initiated, the system resolves LLM credentials using the following hierarchy based on `user.llm_key_preference`:
1. **User Personal Key**: Decrypted from `user_llm_credentials` if `USE_PERSONAL_IF_AVAILABLE` or `ALWAYS_PERSONAL` is configured.
2. **Workspace Key**: Decrypted from `workspace_llm_credentials` for the current workspace if enabled.
3. **System Fallback Key**: Default server environment keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`, etc.).
