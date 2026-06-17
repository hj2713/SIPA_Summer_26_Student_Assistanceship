"""Message persistence operations against SQLite.
"""
import logging
import uuid
from typing import Any

from app.core.database import get_db_conn
from app.schemas.message import MessageRole, MessageRow

logger = logging.getLogger(__name__)


class MessageService:
    """Class encapsulating all message database operations."""

    def __init__(self, db_conn_factory=None) -> None:
        self.db_conn_factory = db_conn_factory or get_db_conn

    def insert_message(
        self,
        client: Any,
        *,
        thread_id: str,
        user_id: str,
        role: MessageRole,
        content: str,
        provider_response_id: str | None = None,
        tokens_input: int | None = None,
        tokens_output: int | None = None,
    ) -> MessageRow:
        """Insert a single message and return the persisted row."""
        msg_id = str(uuid.uuid4())
        row: dict = {
            "id": msg_id,
            "thread_id": str(thread_id),
            "user_id": str(user_id),
            "role": role.value,
            "content": content,
            "provider_response_id": provider_response_id,
            "tokens_input": tokens_input,
            "tokens_output": tokens_output,
        }
        with self.db_conn_factory() as conn:
            conn.execute(
                """
                INSERT INTO messages (id, thread_id, user_id, role, content, provider_response_id, tokens_input, tokens_output)
                VALUES (:id, :thread_id, :user_id, :role, :content, :provider_response_id, :tokens_input, :tokens_output);
                """,
                row
            )
            # Also update the thread's updated_at timestamp!
            conn.execute(
                """
                UPDATE threads
                SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                WHERE id = ?;
                """,
                (str(thread_id),)
            )
            conn.commit()

            cursor = conn.cursor()
            cursor.execute("SELECT * FROM messages WHERE id = ?;", (msg_id,))
            new_row = cursor.fetchone()
            if not new_row:
                raise ValueError("Failed to retrieve newly created message")
            return MessageRow.model_validate(dict(new_row))

    def list_messages(self, client: Any, thread_id: str) -> list[MessageRow]:
        """Fetch all messages for a thread in chronological order."""
        with self.db_conn_factory() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC;",
                (str(thread_id),)
            )
            msg_rows = cursor.fetchall()
            return [MessageRow.model_validate(dict(m)) for m in msg_rows]


# Process-wide singleton instance for dependency injection & route integration
message_service = MessageService()


# Backward-compatible functional delegates
def insert_message(
    client: Any,
    *,
    thread_id: str,
    user_id: str,
    role: MessageRole,
    content: str,
    provider_response_id: str | None = None,
    tokens_input: int | None = None,
    tokens_output: int | None = None,
) -> MessageRow:
    return message_service.insert_message(
        client,
        thread_id=thread_id,
        user_id=user_id,
        role=role,
        content=content,
        provider_response_id=provider_response_id,
        tokens_input=tokens_input,
        tokens_output=tokens_output,
    )


def list_messages(client: Any, thread_id: str) -> list[MessageRow]:
    return message_service.list_messages(client, thread_id)
