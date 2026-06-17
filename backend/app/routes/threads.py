"""Thread management routes.

All routes require a valid JWT (CurrentUserDep).
RLS is enforced at the DB layer via user-scoped Supabase clients.
"""
import logging

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUserDep
from app.schemas.thread import ThreadCreate, ThreadRename, ThreadRow, ThreadWithMessages, ThreadModelUpdate
from app.services import thread_service
from app.core.client import get_user_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/threads", tags=["threads"])


@router.get("", response_model=list[ThreadRow])
async def list_threads(current_user: CurrentUserDep):
    """List all threads for the authenticated user."""
    client = get_user_client(current_user.jwt)
    return thread_service.list_threads(client, current_user.id)


@router.post("", response_model=ThreadRow, status_code=status.HTTP_201_CREATED)
async def create_thread(payload: ThreadCreate, current_user: CurrentUserDep):
    """Create a new thread."""
    client = get_user_client(current_user.jwt)
    return thread_service.create_thread(client, current_user.id, payload)


@router.get("/{thread_id}", response_model=ThreadWithMessages)
async def get_thread(thread_id: str, current_user: CurrentUserDep):
    """Get a thread with its messages."""
    client = get_user_client(current_user.jwt)
    thread = thread_service.get_thread_with_messages(client, thread_id, current_user.id)
    if thread is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
    return thread


@router.delete("/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_thread(thread_id: str, current_user: CurrentUserDep):
    """Delete a thread and cascade its messages."""
    client = get_user_client(current_user.jwt)
    deleted = thread_service.delete_thread(client, thread_id, current_user.id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")


@router.patch("/{thread_id}", response_model=ThreadRow)
async def rename_thread(thread_id: str, payload: ThreadRename, current_user: CurrentUserDep):
    """Rename a thread's title."""
    client = get_user_client(current_user.jwt)
    updated = thread_service.rename_thread(client, thread_id, current_user.id, payload)
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
    return updated


@router.patch("/{thread_id}/model", response_model=ThreadRow)
async def update_thread_model(thread_id: str, payload: ThreadModelUpdate, current_user: CurrentUserDep):
    """Update a thread's LLM model."""
    client = get_user_client(current_user.jwt)
    updated = thread_service.update_thread_model(client, thread_id, current_user.id, payload.model)
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
    return updated
