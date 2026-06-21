"""Request-local context shared by route dependencies and services."""
from __future__ import annotations

from contextvars import ContextVar

_current_user_id: ContextVar[str | None] = ContextVar("current_user_id", default=None)


def set_current_user_id(user_id: str | None) -> None:
    """Set the authenticated user id for the current request context."""
    _current_user_id.set(user_id)


def get_current_user_id() -> str | None:
    """Return the authenticated user id for the current request context."""
    return _current_user_id.get()
