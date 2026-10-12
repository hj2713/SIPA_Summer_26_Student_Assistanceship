# Repository & Data Access Layer Architecture

This directory implements the Repository and Unit of Work patterns for abstracting database operations behind a unified, provider-agnostic interface.

---

## 📁 Modules Overview

| File | Responsibilities |
| :--- | :--- |
| [`base.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/repositories/base.py) | Abstract base repository classes defining interfaces for `UserRepository`, `WorkspaceRepository`, `DashboardRepository`, `DocumentRepository`, `WorkflowRepository`, and `UnitOfWork`. |
| [`factory.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/repositories/factory.py) | `get_db_session()` factory providing a context manager (`with get_db_session() as session:`) that automatically returns either a `PostgresUnitOfWork` or `SQLiteUnitOfWork` based on `settings.DB_PROVIDER`. |
| [`postgres.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/repositories/postgres.py) | Concrete PostgreSQL implementation using Psycopg3 cursor execution, transaction handling, and SQL queries with `%s` parameters. |
| [`sqlite.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/repositories/sqlite.py) | Concrete SQLite implementation using `sqlite3` connection handling, transaction management, and SQL queries with `?` parameters. |

---

## 🧱 Unit of Work Pattern Usage

Always use `get_db_session()` context manager in route handlers and services to handle transactions automatically:

```python
from app.repositories import get_db_session

with get_db_session() as session:
    # 1. Fetch data
    dashboard = session.dashboards.get_by_id(campaign_id)
    
    # 2. Perform updates (automatically committed on exiting context block)
    session.dashboards.update(campaign_id, {"model": "gpt-4o"})
```

---

## 🔒 Multi-Tenant Data Scoping in Repositories

Every domain repository enforces `workspace_id` parameters:
- `session.dashboards.list_by_workspace(workspace_id)`
- `session.documents.list_by_workspace(workspace_id)`
- `session.workflows.list_by_workspace(workspace_id)`

This guarantees that database queries filter records by tenant workspace, preventing cross-tenant leakage at the SQL query level.
