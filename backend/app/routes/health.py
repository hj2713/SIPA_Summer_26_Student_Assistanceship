"""Health check endpoint — no auth required."""
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/db-debug")
async def db_debug():
    from app.core.config import settings
    import psycopg
    
    # Mask password in URL for display
    masked_url = None
    if settings.DATABASE_URL:
        import re
        masked_url = re.sub(r":[^:@/]+@", ":****@", settings.DATABASE_URL)
        
    result = {
        "db_provider": settings.DB_PROVIDER,
        "database_url_configured": bool(settings.DATABASE_URL),
        "database_url_masked": masked_url,
    }
    
    try:
        if settings.DB_PROVIDER == "postgres":
            print(f"Connecting to {masked_url} directly...")
            conn = psycopg.connect(settings.DATABASE_URL)
            with conn.cursor() as cursor:
                cursor.execute("SELECT current_user, session_user, current_database();")
                u_info = cursor.fetchone()
                result["current_user"] = u_info[0]
                result["session_user"] = u_info[1]
                result["current_database"] = u_info[2]
                
                # Check RLS bypass
                cursor.execute("SELECT rolbypassrls FROM pg_roles WHERE rolname = %s;", (result["current_user"],))
                result["rolbypassrls"] = cursor.fetchone()[0]
                
                # Check tables and counts
                cursor.execute("""
                    SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, relowner::regrole::text
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public' AND c.relkind = 'r';
                """)
                tables_info = cursor.fetchall()
                tables = []
                for t in tables_info:
                    # Get row count
                    cursor.execute(f"SELECT count(*) FROM public.{t[0]};")
                    count = cursor.fetchone()[0]
                    tables.append({
                        "table": t[0],
                        "rls_enabled": t[1],
                        "force_rls": t[2],
                        "owner": t[3],
                        "row_count": count
                    })
                result["tables"] = tables
                
                # Check policies
                cursor.execute("""
                    SELECT tablename, policyname, roles, cmd
                    FROM pg_policies
                    WHERE schemaname = 'public';
                """)
                result["policies"] = [
                    {"table": r[0], "policy": r[1], "roles": r[2], "cmd": r[3]}
                    for r in cursor.fetchall()
                ]
            conn.close()
        else:
            result["sqlite_path"] = "sqlite database in use"
    except Exception as e:
        result["error"] = str(e)
        import traceback
        result["traceback"] = traceback.format_exc()
        
    return result



@router.get("/")
async def root() -> dict:
    return {"status": "ok", "message": "Agentic RAG API"}


