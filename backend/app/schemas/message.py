"""Pydantic schemas for messages and chat requests."""
from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel


class MessageRole(str, Enum):
    user = "user"
    assistant = "assistant"
    system = "system"


class MessageRow(BaseModel):
    id: UUID
    thread_id: UUID
    user_id: UUID
    role: MessageRole
    content: str
    provider_response_id: str | None = None
    tokens_input: int | None = None
    tokens_output: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatRequest(BaseModel):
    thread_id: str | None = None   # None → create new thread
    message: str
    workspace_id: str = "TEST"
    pinned_document_ids: list[str] | None = None
    dashboard_id: str | None = None
