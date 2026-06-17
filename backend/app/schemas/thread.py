"""Pydantic schemas for threads and auth."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class CurrentUser(BaseModel):
    """Decoded JWT payload, passed through FastAPI Depends."""
    id: str
    jwt: str  # raw token
    is_admin: bool = False
    can_add: bool = False
    can_delete: bool = False


class ThreadBase(BaseModel):
    title: str = "New conversation"
    provider: str = "openai"
    model: str | None = None


class ThreadCreate(ThreadBase):
    pass


class ThreadRename(BaseModel):
    title: str


class ThreadModelUpdate(BaseModel):
    model: str


class ThreadRow(ThreadBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ThreadWithMessages(ThreadRow):
    """Thread plus its ordered messages."""
    messages: list["MessageRow"] = []


# Resolve forward ref after MessageRow is defined
from app.schemas.message import MessageRow  # noqa: E402
ThreadWithMessages.model_rebuild()
