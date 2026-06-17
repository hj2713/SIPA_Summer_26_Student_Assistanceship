"""Tests for the chat streaming endpoint."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.chat_service import SseEvent


# ---------------------------------------------------------------------------
# Auth guards
# ---------------------------------------------------------------------------

def test_chat_stream_requires_auth(client):
    response = client.post("/api/chat/stream", json={"message": "hello"})
    assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Streaming happy path (mocked)
# ---------------------------------------------------------------------------

async def _fake_stream(**kwargs):
    """Async generator that mimics chat_service.stream_chat output."""
    yield SseEvent(event="delta", data={"text": "Hello"})
    yield SseEvent(event="delta", data={"text": " world"})
    yield SseEvent(
        event="done",
        data={
            "response_id": "resp_123",
            "full_text": "Hello world",
            "tokens_input": 10,
            "tokens_output": 5,
        },
    )


_FAKE_THREAD = {
    "id": "00000000-0000-0000-0000-000000000099",
    "user_id": "00000000-0000-0000-0000-000000000001",
    "title": "Test",
    "provider": "openai",
    "created_at": "2024-01-01T00:00:00+00:00",
    "updated_at": "2024-01-01T00:00:00+00:00",
}

_FAKE_MSG = {
    "id": "00000000-0000-0000-0000-000000000050",
    "thread_id": "00000000-0000-0000-0000-000000000099",
    "user_id": "00000000-0000-0000-0000-000000000001",
    "role": "assistant",
    "content": "Hello world",
    "provider_response_id": "resp_123",
    "tokens_input": 10,
    "tokens_output": 5,
    "created_at": "2024-01-01T00:00:01+00:00",
}


def test_chat_stream_new_thread(client, auth_headers):
    from app.schemas.thread import ThreadRow
    from app.schemas.message import MessageRow

    fake_thread = ThreadRow(**_FAKE_THREAD)
    fake_msg = MessageRow(**_FAKE_MSG)

    with (
        patch("app.routes.chat.get_user_client"),
        patch("app.routes.chat.thread_service.create_thread", return_value=fake_thread),
        patch("app.routes.chat.message_service.insert_message", return_value=fake_msg),
        patch("app.routes.chat.chat_service.stream_chat", side_effect=_fake_stream),
    ):
        response = client.post(
            "/api/chat/stream",
            json={"message": "hi"},
            headers=auth_headers,
        )

    assert response.status_code == 200
    body = response.text
    assert "delta" in body
    assert "Hello" in body
