"""Health check endpoint — no auth required."""
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/db-debug")
async def db_debug():
    from app.core.config import settings
    from app.core.database import get_db_conn
    
    result = {
        "db_provider": settings.DB_PROVIDER,
        "database_url_configured": bool(settings.DATABASE_URL),
        "database_url_prefix": settings.DATABASE_URL[:30] if settings.DATABASE_URL else None,
    }
    
    try:
        with get_db_conn() as conn:
            cursor = conn.cursor()
            
            # Check current user and RLS bypass
            if settings.DB_PROVIDER == "postgres":
                cursor.execute("SELECT current_user, session_user;")
                u_info = cursor.fetchone()
                # Handle both dict rows and tuple rows
                if isinstance(u_info, dict):
                    result["current_user"] = u_info["current_user"]
                    result["session_user"] = u_info["session_user"]
                else:
                    result["current_user"] = u_info[0]
                    result["session_user"] = u_info[1]
                
                # Check RLS bypass
                cursor.execute("SELECT rolbypassrls FROM pg_roles WHERE rolname = %s;", (result["current_user"],))
                u_bypass = cursor.fetchone()
                if isinstance(u_bypass, dict):
                    result["rolbypassrls"] = u_bypass["rolbypassrls"]
                else:
                    result["rolbypassrls"] = u_bypass[0]
                
                # Check policies in database
                cursor.execute("""
                    SELECT tablename, policyname, roles, cmd
                    FROM pg_policies
                    WHERE schemaname = 'public';
                """)
                rows = cursor.fetchall()
                policies = []
                for r in rows:
                    if isinstance(r, dict):
                        policies.append({"table": r["tablename"], "policy": r["policyname"], "roles": r["roles"], "cmd": r["cmd"]})
                    else:
                        policies.append({"table": r[0], "policy": r[1], "roles": r[2], "cmd": r[3]})
                result["policies"] = policies
            else:
                result["sqlite_path"] = "sqlite database in use"
                
            # Try to fetch workspaces count
            cursor.execute("SELECT count(*) FROM workspaces;")
            w_count = cursor.fetchone()
            result["workspaces_count"] = w_count["count"] if isinstance(w_count, dict) else w_count[0]
            
            # Try to fetch users count
            cursor.execute("SELECT count(*) FROM users;")
            u_count = cursor.fetchone()
            result["users_count"] = u_count["count"] if isinstance(u_count, dict) else u_count[0]
            
    except Exception as e:
        result["error"] = str(e)
        import traceback
        result["traceback"] = traceback.format_exc()
        
    return result


@router.get("/")
async def root() -> dict:
    return {"status": "ok", "message": "Agentic RAG API"}


