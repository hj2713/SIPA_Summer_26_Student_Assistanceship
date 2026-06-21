"""Chat streaming endpoint via Server-Sent Events.

Flow:
  1. Validate auth.
  2. Create thread if thread_id not provided.
  3. Persist user message.
  4. Call OpenAI Responses API (streaming).
  5. Relay SSE events to client.
  6. On 'done': persist assistant message + update thread.provider_thread_id.
"""
import json
import logging
from collections.abc import AsyncGenerator

from fastapi import APIRouter, HTTPException, status
from sse_starlette.sse import EventSourceResponse

from app.core.deps import CurrentUserDep
from app.schemas.message import ChatRequest, MessageRole
from app.schemas.thread import ThreadCreate
from app.services import chat_service, message_service, thread_service
from app.core.client import get_user_client
from app.core.prompts import CHAT_SYSTEM_PROMPT

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/stream")
async def chat_stream(request: ChatRequest, current_user: CurrentUserDep):
    """SSE endpoint: send a user message and stream the assistant reply.

    Response headers include X-Accel-Buffering: no to prevent proxy buffering.
    """
    client = get_user_client(current_user.jwt, request.workspace_id)

    # Resolve or create thread
    if request.thread_id:
        thread = thread_service.get_thread(client, request.thread_id, current_user.id)
        if thread is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
        is_new_thread = False
    else:
        # Clean title text to remove attached/pinned file boundaries
        title_text = request.message
        if "---PINNED_BOUNDARY---" in title_text:
            title_text = title_text.split("---PINNED_BOUNDARY---\n\n", 1)[-1]
        if "---ATTACHMENT_BOUNDARY---" in title_text:
            title_text = title_text.split("---ATTACHMENT_BOUNDARY---\n\n", 1)[-1]

        thread = thread_service.create_thread(
            client, current_user.id, ThreadCreate(title=title_text[:60], dashboard_id=request.dashboard_id)
        )
        is_new_thread = True

    # Persist user message
    message_service.insert_message(
        client,
        thread_id=str(thread.id),
        user_id=current_user.id,
        role=MessageRole.user,
        content=request.message,
    )

    async def event_generator() -> AsyncGenerator[dict, None]:
        # First frame: thread id (useful for new threads so client can redirect)
        if is_new_thread:
            yield {"event": "thread", "data": json.dumps({"thread_id": str(thread.id)})}

        full_text = ""
        response_id = ""
        tokens_input = 0
        tokens_output = 0

        # Fetch full message history including the user's latest message
        history = message_service.list_messages(client, str(thread.id))
        
        system_prompt = CHAT_SYSTEM_PROMPT
        
        # Inject dynamic campaign/dashboard context if active
        if request.dashboard_id:
            from app.core.database import get_db_conn
            with get_db_conn() as conn:
                cursor = conn.cursor()
                # 1. Fetch campaign details
                cursor.execute("SELECT name, description, prompt FROM dashboards WHERE id = ?;", (str(request.dashboard_id),))
                camp_row = cursor.fetchone()
                
                # 2. Fetch linked files status
                cursor.execute(
                    """
                    SELECT d.filename, dd.status
                    FROM dashboard_documents dd
                    JOIN documents d ON dd.document_id = d.id
                    WHERE dd.dashboard_id = ?;
                    """,
                    (str(request.dashboard_id),)
                )
                doc_rows = cursor.fetchall()
            
            if camp_row:
                camp_name = camp_row[0]
                camp_desc = camp_row[1]
                camp_codebook = camp_row[2]
                
                files_summary = "\n".join(f"- `{r[0]}` (Status: {r[1]})" for r in doc_rows) if doc_rows else "No files linked yet."
                
                system_prompt = (
                    f"You are a specialized AI Research Assistant for the Campaign: '{camp_name}'.\n"
                    f"Description: {camp_desc}\n\n"
                    f"=== CAMPAIGN CODING RULES & CODEBOOK ===\n"
                    f"{camp_codebook}\n\n"
                    f"=== DATASET FILE OBSERVABILITY ===\n"
                    f"The current campaign spreadsheet has the following files linked:\n"
                    f"{files_summary}\n\n"
                    f"=== INSTRUCTIONS ===\n"
                    f"1. Answer user queries explicitly in the context of this Research Campaign.\n"
                    f"2. Use the `retrieve_documents` search tool to gather evidence from the linked documents.\n"
                    f"3. Cite file names using backticks (e.g. `filename.txt`).\n"
                    f"4. If asked about the campaign configuration or files status, use the information provided above."
                )

        formatted_messages = [{"role": "system", "content": system_prompt}]
        for msg in history:
            formatted_messages.append({"role": msg.role.value, "content": msg.content})

        async for sse in chat_service.stream_chat(
            user_id=current_user.id,
            thread_id=str(thread.id),
            messages=formatted_messages,
            user_client=client,
            pinned_document_ids=request.pinned_document_ids,
            dashboard_id=request.dashboard_id,
        ):
            if sse.event != "done":
                yield {"event": sse.event, "data": json.dumps(sse.data)}

            if sse.event == "delta":
                full_text += sse.data.get("text", "")
            elif sse.event == "done":
                response_id = sse.data.get("response_id", "")
                tokens_input = sse.data.get("tokens_input", 0)
                tokens_output = sse.data.get("tokens_output", 0)
            elif sse.event == "error":
                return  # stop iteration on error

        # Persist assistant message
        if full_text:
            msg = message_service.insert_message(
                client,
                thread_id=str(thread.id),
                user_id=current_user.id,
                role=MessageRole.assistant,
                content=full_text,
                provider_response_id=response_id or None,
                tokens_input=tokens_input or None,
                tokens_output=tokens_output or None,
            )
            yield {
                "event": "done",
                "data": json.dumps({"message_id": str(msg.id), "response_id": response_id}),
            }

    return EventSourceResponse(
        event_generator(),
        headers={"X-Accel-Buffering": "no"},
    )
