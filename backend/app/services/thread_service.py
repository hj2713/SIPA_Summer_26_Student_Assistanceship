"""Thread CRUD operations against SQLite.
"""
import logging
import uuid
from typing import Any

from app.core.database import get_db_conn
from app.schemas.thread import ThreadCreate, ThreadRename, ThreadRow, ThreadWithMessages
from app.schemas.message import MessageRow

logger = logging.getLogger(__name__)


class ThreadService:
    """Class encapsulating all thread database operations."""

    def __init__(self, db_conn_factory=None) -> None:
        self.db_conn_factory = db_conn_factory or get_db_conn

    def _row_to_thread(self, row: Any) -> ThreadRow:
        """Helper to convert a SQLite Row to a ThreadRow Pydantic model."""
        return ThreadRow.model_validate(dict(row))

    def list_threads(self, client: Any, user_id: str) -> list[ThreadRow]:
        """Return all threads for the user, most recently updated first."""
        with self.db_conn_factory() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM threads WHERE user_id = ? ORDER BY updated_at DESC;",
                (str(user_id),)
            )
            rows = cursor.fetchall()
            return [self._row_to_thread(row) for row in rows]

    def create_thread(self, client: Any, user_id: str, payload: ThreadCreate) -> ThreadRow:
        """Insert a new thread and return it."""
        thread_id = str(uuid.uuid4())
        row = {
            "id": thread_id,
            "user_id": str(user_id),
            "title": payload.title,
            "provider": payload.provider,
            "model": payload.model,
        }
        with self.db_conn_factory() as conn:
            conn.execute(
                """
                INSERT INTO threads (id, user_id, title, provider, model)
                VALUES (:id, :user_id, :title, :provider, :model);
                """,
                row
            )
            conn.commit()
            
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM threads WHERE id = ?;", (thread_id,))
            new_row = cursor.fetchone()
            if not new_row:
                raise ValueError("Failed to retrieve newly created thread")
            return self._row_to_thread(new_row)

    def update_thread_model(
        self, client: Any, thread_id: str, user_id: str, model: str
    ) -> ThreadRow | None:
        """Update a thread's model choice. Returns updated thread or None if not found."""
        with self.db_conn_factory() as conn:
            cursor = conn.cursor()
            conn.execute(
                """
                UPDATE threads
                SET model = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                WHERE id = ? AND user_id = ?;
                """,
                (model, str(thread_id), str(user_id))
            )
            conn.commit()
            
            cursor.execute(
                "SELECT * FROM threads WHERE id = ? AND user_id = ?;",
                (str(thread_id), str(user_id))
            )
            row = cursor.fetchone()
            return self._row_to_thread(row) if row else None

    def get_thread(self, client: Any, thread_id: str, user_id: str) -> ThreadRow | None:
        """Fetch a single thread. Returns None if not found or not owned by user."""
        with self.db_conn_factory() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM threads WHERE id = ? AND user_id = ?;",
                (str(thread_id), str(user_id))
            )
            row = cursor.fetchone()
            return self._row_to_thread(row) if row else None

    def get_thread_with_messages(
        self, client: Any, thread_id: str, user_id: str
    ) -> ThreadWithMessages | None:
        """Fetch thread + its messages ordered by created_at asc."""
        thread = self.get_thread(client, thread_id, user_id)
        if thread is None:
            return None

        with self.db_conn_factory() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC;",
                (str(thread_id),)
            )
            msg_rows = cursor.fetchall()
            messages = [MessageRow.model_validate(dict(m)) for m in msg_rows]
            return ThreadWithMessages(**thread.model_dump(), messages=messages)

    def delete_thread(self, client: Any, thread_id: str, user_id: str) -> bool:
        """Delete a thread. Returns True if a row was deleted."""
        with self.db_conn_factory() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM threads WHERE id = ? AND user_id = ?;",
                (str(thread_id), str(user_id))
            )
            conn.commit()
            return cursor.rowcount > 0

    def rename_thread(
        self, client: Any, thread_id: str, user_id: str, payload: ThreadRename
    ) -> ThreadRow | None:
        """Rename a thread's title. Returns updated thread or None if not found."""
        with self.db_conn_factory() as conn:
            cursor = conn.cursor()
            conn.execute(
                """
                UPDATE threads
                SET title = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                WHERE id = ? AND user_id = ?;
                """,
                (payload.title, str(thread_id), str(user_id))
            )
            conn.commit()
            
            cursor.execute(
                "SELECT * FROM threads WHERE id = ? AND user_id = ?;",
                (str(thread_id), str(user_id))
            )
            row = cursor.fetchone()
            return self._row_to_thread(row) if row else None


# Process-wide singleton instance for dependency injection & route integration
thread_service = ThreadService()


# Backward-compatible functional delegates
def list_threads(client: Any, user_id: str) -> list[ThreadRow]:
    return thread_service.list_threads(client, user_id)


def create_thread(client: Any, user_id: str, payload: ThreadCreate) -> ThreadRow:
    return thread_service.create_thread(client, user_id, payload)


def get_thread(client: Any, thread_id: str, user_id: str) -> ThreadRow | None:
    return thread_service.get_thread(client, thread_id, user_id)


def get_thread_with_messages(
    client: Any, thread_id: str, user_id: str
) -> ThreadWithMessages | None:
    return thread_service.get_thread_with_messages(client, thread_id, user_id)


def delete_thread(client: Any, thread_id: str, user_id: str) -> bool:
    return thread_service.delete_thread(client, thread_id, user_id)


def rename_thread(
    client: Any, thread_id: str, user_id: str, payload: ThreadRename
) -> ThreadRow | None:
    return thread_service.rename_thread(client, thread_id, user_id, payload)


def update_thread_model(
    client: Any, thread_id: str, user_id: str, model: str
) -> ThreadRow | None:
    return thread_service.update_thread_model(client, thread_id, user_id, model)
