"""Pydantic schemas for documents and their extracted metadata."""
from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class DocumentStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class DocumentMetadata(BaseModel):
    title: str = Field(description="Clean, simplified title of the document")
    summary: str = Field(description="A concise 2-3 sentence summary of the main points")
    category: str = Field(description="One of: 'guide', 'report', 'code', 'legal', 'invoice', 'article', 'general'")
    tags: list[str] = Field(description="List of 3-5 keywords or topic tags")
    author: str | None = Field(default=None, description="Extracted author name if available")
    date: str | None = Field(default=None, description="Extracted creation date in YYYY-MM-DD or year if available")


class DocumentBase(BaseModel):
    filename: str
    file_size: int
    content_type: str


class DocumentCreate(DocumentBase):
    file_path: str
    content_hash: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class DocumentRow(DocumentBase):
    id: UUID
    user_id: UUID
    workspace_id: str | None = None
    file_path: str
    status: DocumentStatus
    content_hash: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DocumentUploadResponse(BaseModel):
    id: UUID
    filename: str
    status: DocumentStatus
    created_at: datetime
    upserted: bool = False


class RetryBatchRequest(BaseModel):
    document_ids: list[UUID]
