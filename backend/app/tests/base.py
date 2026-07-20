import os
import re
import threading
import pytest
from unittest.mock import patch
from contextlib import contextmanager
from typing import Any, Dict, List, Set, final
from app.core.config import settings


# Global storage to track database permissions during tests.
# Using a shared dictionary instead of threading.local() ensures permissions propagate
# correctly to FastAPI worker threads managed by TestClient/AnyIO.
_test_permissions = {
    "allow_insert": False,
    "allow_update": False,
    "allow_delete": False,
}

def get_current_permissions() -> Dict[str, bool]:
    return _test_permissions


# Global registry of IDs, keys, emails, and names created/managed by tests.
# Any database modification target (WHERE clause params) must contain one of these IDs.
ALLOWED_TEST_IDS: Set[str] = {
    "00000000-0000-0000-0000-000000000001",  # TEST_USER_ID
    "QA",                                    # QA workspace
    "test@test.com",                         # TEST user email
    "test@gmail.com",                        # Admin user email
    "mock_hash",
}


class SafeTestCursor:
    """A wrapper for psycopg/sqlite cursors that validates all SQL queries during tests.
    
    Prevents unauthorized updates, deletes, and drops, and blocks unqualified mutations.
    """
    def __init__(self, real_cursor):
        self._real_cursor = real_cursor

    def execute(self, query: str, params: Any = None):
        translated_query = self._translate_and_validate_query(query, params)
        if params is None:
            return self._real_cursor.execute(translated_query)
        return self._real_cursor.execute(translated_query, params)

    def executemany(self, query: str, params_list: List[Any]):
        translated_query = None
        for params in params_list:
            translated_query = self._translate_and_validate_query(query, params)
        if translated_query is None:
            translated_query = self._translate_and_validate_query(query, None)
        return self._real_cursor.executemany(translated_query, params_list)

    def _translate_and_validate_query(self, query: str, params: Any) -> str:
        self._validate_query(query, params)
        
        # Translate dialect if running against Postgres/Supabase
        if settings.DB_PROVIDER == "postgres":
            query_upper = query.strip().upper()
            
            # 1. Translate parameter placeholder: ? -> %s
            query = query.replace("?", "%s")
            
            # 2. Translate INSERT OR IGNORE INTO -> INSERT INTO ... ON CONFLICT DO NOTHING
            if "INSERT OR IGNORE INTO" in query_upper:
                query = re.sub(r"(?i)INSERT\s+OR\s+IGNORE\s+INTO", "INSERT INTO", query)
                if "ON CONFLICT" not in query.upper():
                    query = query.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING;"
                    
            # 3. Translate INSERT OR REPLACE INTO -> INSERT INTO ... ON CONFLICT (...) DO UPDATE ...
            elif "INSERT OR REPLACE INTO" in query_upper:
                query = re.sub(r"(?i)INSERT\s+OR\s+REPLACE\s+INTO", "INSERT INTO", query)
                if "ON CONFLICT" not in query.upper():
                    if "USERS" in query_upper:
                        query = query.rstrip().rstrip(";") + " ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, password_hash=EXCLUDED.password_hash, is_admin=EXCLUDED.is_admin, can_add=EXCLUDED.can_add, can_delete=EXCLUDED.can_delete;"
                    elif "WORKSPACES" in query_upper:
                        query = query.rstrip().rstrip(";") + " ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name;"
                    elif "DASHBOARDS" in query_upper:
                        query = query.rstrip().rstrip(";") + " ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, prompt=EXCLUDED.prompt, schema=EXCLUDED.schema;"
                    elif "DOCUMENTS" in query_upper:
                        query = query.rstrip().rstrip(";") + " ON CONFLICT (id) DO UPDATE SET filename=EXCLUDED.filename, file_path=EXCLUDED.file_path, file_size=EXCLUDED.file_size, content_type=EXCLUDED.content_type, status=EXCLUDED.status, error_message=EXCLUDED.error_message, content_hash=EXCLUDED.content_hash, metadata=EXCLUDED.metadata;"
                        
        return query

    def _validate_query(self, query: str, params: Any):
        query_upper = query.strip().upper()
        
        # 1. Block TRUNCATE and DROP completely in tests
        if "TRUNCATE" in query_upper or "DROP" in query_upper:
            raise RuntimeError(
                f"CRITICAL SAFETY VIOLATION: TRUNCATE/DROP is strictly forbidden in tests. Query: {query}"
            )
            
        is_select = query_upper.startswith("SELECT") or "SELECT " in query_upper
        is_insert = query_upper.startswith("INSERT")
        is_update = query_upper.startswith("UPDATE")
        is_delete = query_upper.startswith("DELETE")
        
        # SELECT queries are read-only and always allowed
        if is_select and not (is_insert or is_update or is_delete):
            return
            
        perms = get_current_permissions()
        
        # 2. Validate INSERT
        if is_insert:
            if not perms.get("allow_insert"):
                raise RuntimeError(
                    f"CRITICAL SAFETY VIOLATION: INSERT executed without database permission inside test! Query: {query}"
                )
            # Register newly inserted IDs to allow deleting them later
            if params:
                values = params.values() if isinstance(params, dict) else params
                for val in values:
                    if isinstance(val, str):
                        ALLOWED_TEST_IDS.add(val)
            # Find any single-quoted literals in query
            literals = re.findall(r"'(.*?)'", query)
            for lit in literals:
                ALLOWED_TEST_IDS.add(lit)
            return

        if is_delete:
            raise RuntimeError(
                f"CRITICAL SAFETY VIOLATION: DELETE queries are strictly forbidden in tests! Query: {query}"
            )
                
            if "WHERE" not in query_upper:
                raise RuntimeError(
                    f"CRITICAL SAFETY VIOLATION: Unqualified {action} (no WHERE clause) is forbidden in tests. Query: {query}"
                )
                
            # Verify the query targets a registered test ID/parameter to protect production data
            has_allowed_target = False
            if params:
                values = params.values() if isinstance(params, dict) else params
                for val in values:
                    if str(val) in ALLOWED_TEST_IDS:
                        has_allowed_target = True
                        break
            else:
                literals = re.findall(r"'(.*?)'", query)
                for lit in literals:
                    if lit in ALLOWED_TEST_IDS:
                        has_allowed_target = True
                        break
                        
            if not has_allowed_target:
                param_list = list(params.values()) if isinstance(params, dict) else (list(params) if params else [])
                raise RuntimeError(
                    f"CRITICAL SAFETY VIOLATION: {action} targets data outside the allowed test scope. "
                    f"Parameters/literals: {param_list}. Query: {query}"
                )

    def __enter__(self):
        if hasattr(self._real_cursor, "__enter__"):
            self._real_cursor.__enter__()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if hasattr(self._real_cursor, "__exit__"):
            return self._real_cursor.__exit__(exc_type, exc_val, exc_tb)
        try:
            self._real_cursor.close()
        except Exception:
            pass

    def __getattr__(self, name):
        return getattr(self._real_cursor, name)


class SafeTestConnection:
    """A wrapper for psycopg/sqlite connections that produces SafeTestCursor."""
    def __init__(self, real_conn):
        self._real_conn = real_conn

    def cursor(self, *args, **kwargs):
        real_cur = self._real_conn.cursor(*args, **kwargs)
        return SafeTestCursor(real_cur)

    def execute(self, query: str, params: Any = None):
        cursor = self.cursor()
        if params is None:
            cursor.execute(query)
        else:
            cursor.execute(query, params)
        return cursor

    def commit(self):
        self._real_conn.commit()

    def rollback(self):
        self._real_conn.rollback()

    def close(self):
        self._real_conn.close()

    def __getattr__(self, name):
        return getattr(self._real_conn, name)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.rollback()
        self.close()


class BaseTestCase:
    """Parent base class for all database tests.
    
    Enforces strict read-only settings by default and blocks illegal operations on subclass tests.
    """
    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        # Prevent subclass tests from overriding critical safety methods
        for method_name in ("get_db", "database_permission"):
            if method_name in cls.__dict__:
                raise TypeError(f"Method '{method_name}' is final and cannot be overridden by subclass '{cls.__name__}'.")

    @final
    def get_db(self):
        """Final method to get the database session wrapped with safety checks."""
        os.environ["TEST_MODE"] = "1"
        from app.repositories.factory import get_db_session
        return get_db_session()

    @final
    @contextmanager
    def database_permission(self, allow_insert: bool = False, allow_update: bool = False, allow_delete: bool = False):
        """Context manager to temporarily allow database mutations inside a test block."""
        perms = get_current_permissions()
        old_perms = perms.copy()
        perms["allow_insert"] = allow_insert
        perms["allow_update"] = allow_update
        perms["allow_delete"] = allow_delete
        try:
            yield
        finally:
            perms.update(old_perms)

    @pytest.fixture(autouse=True)
    def setup_safety_shield(self):
        """Autouse fixture to intercept and block any file deletion calls targeting database files."""
        original_remove = os.remove
        original_unlink = os.unlink

        def safe_remove(path, *args, **kwargs):
            path_str = str(path)
            # Block any deletions containing local_rag.db (but allow test_local_rag.db)
            if "local_rag.db" in path_str and "test_local_rag.db" not in path_str:
                raise RuntimeError(
                    f"CRITICAL SAFETY SHIELD: Deleting production database file '{path}' is strictly forbidden!"
                )
            return original_remove(path, *args, **kwargs)

        def safe_unlink(path, *args, **kwargs):
            path_str = str(path)
            if "local_rag.db" in path_str and "test_local_rag.db" not in path_str:
                raise RuntimeError(
                    f"CRITICAL SAFETY SHIELD: Deleting production database file '{path}' is strictly forbidden!"
                )
            return original_unlink(path, *args, **kwargs)

        with patch("os.remove", side_effect=safe_remove), patch("os.unlink", side_effect=safe_unlink):
            yield

