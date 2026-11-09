"""
Test Factories and Mock Fixtures for Law Delegation Platform.

Provides high-level, reusable abstract layers for testing:
- Users & Authentication (`create_test_user`)
- Workspaces & Collaboration (`create_test_workspace`, `share_workspace_with_user`)
- Encrypted LLM BYOK Credentials (`save_test_llm_key`)
- Research Campaigns & Benchmarks (`create_test_campaign`, `link_document_to_campaign`)
- Coding Workflows & DAG Pipelines (`create_test_workflow`)
- Ingested Documents & Statutes (`create_test_document`)
- Chat Threads & Messages (`create_test_thread`, `create_test_message`)
- LLM Response & Stream Mocking (`mock_llm_reply`)
"""

import os
import json
import uuid
import time
from typing import Optional, Dict, Any, List
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

from app.core.config import settings
from app.repositories import get_db_session
from app.core.llm_credentials import encrypt_api_key
from app.tests.base import ALLOWED_TEST_IDS
from app.tests.conftest import make_jwt


# ---------------------------------------------------------------------------
# 1. User & Auth Factory
# ---------------------------------------------------------------------------
def create_test_user(
    email: Optional[str] = None,
    password: str = "testpassword123",
    is_admin: bool = False,
    can_add: bool = True,
    can_delete: bool = True,
    key_preference: str = "USE_PERSONAL_IF_AVAILABLE",
) -> Dict[str, Any]:
    """Create a verified test user in the database and return user details with auth headers."""
    user_id = str(uuid.uuid4())
    user_email = email or f"user_{uuid.uuid4().hex[:8]}@example.com"
    
    ALLOWED_TEST_IDS.add(user_id)
    ALLOWED_TEST_IDS.add(user_email)

    with get_db_session() as session:
        cursor = session.conn.cursor()
        cursor.execute(
            """INSERT INTO users (id, email, password_hash, is_admin, can_add, can_delete, llm_key_preference)
               VALUES (?, ?, ?, ?, ?, ?, ?);""",
            (user_id, user_email, f"hash_{password}", 1 if is_admin else 0, 1 if can_add else 0, 1 if can_delete else 0, key_preference)
        )
        session.conn.commit()

    token = make_jwt(user_id=user_id)
    return {
        "id": user_id,
        "email": user_email,
        "is_admin": is_admin,
        "llm_key_preference": key_preference,
        "jwt": token,
        "headers": {"Authorization": f"Bearer {token}"},
    }


# ---------------------------------------------------------------------------
# 2. Workspace & Collaboration Factory
# ---------------------------------------------------------------------------
def create_test_workspace(
    name: Optional[str] = None,
    creator_user_id: Optional[str] = None,
    creator_email: Optional[str] = None,
) -> Dict[str, Any]:
    """Create an isolated test workspace and optionally assign owner membership."""
    ws_id = f"ws_{uuid.uuid4().hex[:10]}"
    ws_name = name or f"Workspace_{uuid.uuid4().hex[:6].upper()}"
    
    ALLOWED_TEST_IDS.add(ws_id)
    ALLOWED_TEST_IDS.add(ws_name)

    with get_db_session() as session:
        cursor = session.conn.cursor()
        cursor.execute(
            "INSERT INTO workspaces (id, name, created_by) VALUES (?, ?, ?);",
            (ws_id, ws_name, creator_user_id)
        )
        if creator_email:
            member_id = str(uuid.uuid4())
            ALLOWED_TEST_IDS.add(member_id)
            cursor.execute(
                "INSERT INTO workspace_memberships (id, workspace_id, user_email, role) VALUES (?, ?, ?, 'owner');",
                (member_id, ws_id, creator_email)
            )
        session.conn.commit()

    return {
        "id": ws_id,
        "name": ws_name,
        "created_by": creator_user_id,
    }


def share_workspace_with_user(
    workspace_id: str,
    user_email: str,
    role: str = "member",
) -> Dict[str, Any]:
    """Grant a user membership access to a workspace."""
    member_id = str(uuid.uuid4())
    ALLOWED_TEST_IDS.add(member_id)
    ALLOWED_TEST_IDS.add(workspace_id)
    ALLOWED_TEST_IDS.add(user_email)

    with get_db_session() as session:
        cursor = session.conn.cursor()
        cursor.execute(
            """INSERT OR REPLACE INTO workspace_memberships (id, workspace_id, user_email, role)
               VALUES (?, ?, ?, ?);""",
            (member_id, workspace_id, user_email, role)
        )
        session.conn.commit()

    return {
        "id": member_id,
        "workspace_id": workspace_id,
        "user_email": user_email,
        "role": role,
    }


# ---------------------------------------------------------------------------
# 3. Encrypted LLM Credentials Factory (BYOK)
# ---------------------------------------------------------------------------
def save_test_llm_key(
    provider: str = "openai",
    api_key: str = "sk-test-mock-key-12345",
    user_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    model: Optional[str] = None,
    base_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Encrypt and store an LLM API key in the database.
    Can be scoped to a specific user (personal key) or workspace (shared key).
    """
    if not user_id and not workspace_id:
        raise ValueError("Must provide either user_id (personal) or workspace_id (workspace) to save_test_llm_key.")

    cred_id = f"cred_{uuid.uuid4().hex[:10]}"
    ALLOWED_TEST_IDS.add(cred_id)
    encrypted_key = encrypt_api_key(api_key)

    with get_db_session() as session:
        cursor = session.conn.cursor()
        if user_id:
            ALLOWED_TEST_IDS.add(user_id)
            cursor.execute(
                """INSERT OR REPLACE INTO user_llm_credentials
                   (id, user_id, provider, api_key_encrypted, model, base_url)
                   VALUES (?, ?, ?, ?, ?, ?);""",
                (cred_id, user_id, provider.lower(), encrypted_key, model, base_url)
            )
        if workspace_id:
            ALLOWED_TEST_IDS.add(workspace_id)
            cursor.execute(
                """INSERT OR REPLACE INTO workspace_llm_credentials
                   (id, workspace_id, provider, api_key_encrypted, model, base_url)
                   VALUES (?, ?, ?, ?, ?, ?);""",
                (cred_id, workspace_id, provider.lower(), encrypted_key, model, base_url)
            )
        session.conn.commit()

    return {
        "id": cred_id,
        "provider": provider.lower(),
        "api_key": api_key,
        "user_id": user_id,
        "workspace_id": workspace_id,
        "is_configured": True,
    }


# ---------------------------------------------------------------------------
# 4. Research Campaign & Dashboard Factory
# ---------------------------------------------------------------------------
def create_test_campaign(
    workspace_id: str,
    name: Optional[str] = None,
    prompt: Optional[str] = None,
    schema: Optional[List[Dict[str, Any]]] = None,
    dashboard_type: str = "workflow",
    models: Optional[List[str]] = None,
    workflow_id: Optional[str] = None,
    campaign_id: Optional[str] = None,
    description: Optional[str] = None,
    model: Optional[str] = None,
    workflow_source: Optional[str] = None,
    workflow_definition_json: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a research campaign dashboard (Prompt Codebook or Workflow Evaluation)."""
    cid = campaign_id or str(uuid.uuid4())
    ALLOWED_TEST_IDS.add(cid)
    ALLOWED_TEST_IDS.add(workspace_id)

    campaign_name = name or f"Campaign_{uuid.uuid4().hex[:6]}"
    campaign_prompt = prompt or "Evaluate statutory administrative discretion across executive agencies."
    campaign_desc = description or "Empirical test campaign"
    campaign_schema = schema or [
        {"name": "delegate_law", "type": "int", "description": "Binary delegation indicator (0 or 1)"},
        {"name": "discretion_rank", "type": "int", "description": "Degree of discretion (scale 0-5)"},
    ]
    models_str = model or (",".join(models) if models else "gpt-4o-mini")

    with get_db_session() as session:
        cursor = session.conn.cursor()
        cursor.execute(
            """INSERT INTO dashboards
               (id, workspace_id, name, description, prompt, schema, model, dashboard_type, workflow_id, workflow_source, workflow_definition_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);""",
            (
                cid,
                workspace_id,
                campaign_name,
                campaign_desc,
                campaign_prompt,
                json.dumps(campaign_schema) if isinstance(campaign_schema, list) else str(campaign_schema),
                models_str,
                dashboard_type,
                workflow_id,
                workflow_source,
                workflow_definition_json,
            )
        )
        session.conn.commit()

    return {
        "id": cid,
        "workspace_id": workspace_id,
        "name": campaign_name,
        "description": campaign_desc,
        "prompt": campaign_prompt,
        "schema": campaign_schema,
        "model": models_str,
        "dashboard_type": dashboard_type,
        "workflow_id": workflow_id,
    }


def link_document_to_campaign(
    dashboard_id: str,
    document_id: str,
    coded_values: Optional[Dict[str, Any]] = None,
    status: str = "completed",
    workflow_trace: Optional[str] = None,
) -> Dict[str, Any]:
    """Attach a document row to a campaign dashboard with optional coded values."""
    ALLOWED_TEST_IDS.add(dashboard_id)
    ALLOWED_TEST_IDS.add(document_id)

    values = coded_values or {"delegate_law": 1, "discretion_rank": 3}
    
    with get_db_session() as session:
        cursor = session.conn.cursor()
        cursor.execute(
            """INSERT OR REPLACE INTO dashboard_documents
               (dashboard_id, document_id, coded_values, status, workflow_trace)
               VALUES (?, ?, ?, ?, ?);""",
            (dashboard_id, document_id, json.dumps(values), status, workflow_trace or "{}")
        )
        session.conn.commit()

    return {
        "dashboard_id": dashboard_id,
        "document_id": document_id,
        "coded_values": values,
        "status": status,
    }


# ---------------------------------------------------------------------------
# 5. Coding Workflow DAG Factory
# ---------------------------------------------------------------------------
def create_test_workflow(
    workspace_id: str,
    name: Optional[str] = None,
    created_by: str = "test@test.com",
    definition: Optional[Dict[str, Any]] = None,
    status: str = "published",
) -> Dict[str, Any]:
    """Create a multi-step coding workflow definition with a valid DAG."""
    wf_id = f"wf_{uuid.uuid4().hex[:10]}"
    ALLOWED_TEST_IDS.add(wf_id)
    ALLOWED_TEST_IDS.add(workspace_id)

    wf_name = name or f"Workflow_{uuid.uuid4().hex[:6]}"
    default_def = definition or {
        "schema_version": 1,
        "nodes": [
            {
                "id": "node-1",
                "kind": "llm",
                "label": "Delegation Screening",
                "config": {"prompt": "Does statute delegate authority?"},
            },
            {
                "id": "node-2",
                "kind": "branch",
                "label": "Discretion Classifier",
                "config": {"condition": "delegate_law == 1"},
            },
        ],
        "edges": [
            {"id": "edge-1", "source": "node-1", "target": "node-2"},
        ],
    }

    with get_db_session() as session:
        cursor = session.conn.cursor()
        cursor.execute(
            """INSERT INTO coding_workflows
               (id, workspace_id, name, description, status, draft_definition, created_by, revision, latest_version)
               VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1);""",
            (wf_id, workspace_id, wf_name, "Test DAG pipeline", status, json.dumps(default_def), created_by)
        )
        session.conn.commit()

    return {
        "id": wf_id,
        "workspace_id": workspace_id,
        "name": wf_name,
        "definition": default_def,
        "status": status,
    }


# ---------------------------------------------------------------------------
# 6. Document & Statute Factory
# ---------------------------------------------------------------------------
def create_test_document(
    workspace_id: str,
    user_id: Optional[str] = None,
    filename: Optional[str] = None,
    text_content: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    status: str = "completed",
    document_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Create an ingested statute document record in the database."""
    doc_id = document_id or str(uuid.uuid4())
    ALLOWED_TEST_IDS.add(doc_id)
    ALLOWED_TEST_IDS.add(workspace_id)
    
    owner_user_id = user_id or "00000000-0000-0000-0000-000000000001"
    ALLOWED_TEST_IDS.add(owner_user_id)

    doc_filename = filename or f"Public_Law_{uuid.uuid4().hex[:6]}.txt"
    content = text_content or "Public Law 104-121: An Act to authorize administrative rulemaking for regulatory enforcement."
    doc_metadata = metadata or {"title": doc_filename, "congress": 104, "public_law": "104-121"}

    with get_db_session() as session:
        cursor = session.conn.cursor()
        cursor.execute(
            """INSERT INTO documents
               (id, user_id, workspace_id, filename, file_path, file_size, content_type, status, metadata)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);""",
            (
                doc_id,
                owner_user_id,
                workspace_id,
                doc_filename,
                f"/storage/{workspace_id}/{doc_filename}",
                len(content.encode("utf-8")),
                "text/plain",
                status,
                json.dumps(doc_metadata),
            )
        )
        session.conn.commit()

    return {
        "id": doc_id,
        "workspace_id": workspace_id,
        "filename": doc_filename,
        "content": content,
        "metadata": doc_metadata,
        "status": status,
    }


# ---------------------------------------------------------------------------
# 7. Chat Threads & Messages Factory
# ---------------------------------------------------------------------------
def create_test_thread(
    user_id: str,
    workspace_id: str,
    title: str = "Test Legal Inquiry",
    model: str = "gpt-4o-mini",
) -> Dict[str, Any]:
    """Create a chat conversation thread."""
    thread_id = str(uuid.uuid4())
    ALLOWED_TEST_IDS.add(thread_id)
    ALLOWED_TEST_IDS.add(user_id)

    with get_db_session() as session:
        cursor = session.conn.cursor()
        cursor.execute(
            """INSERT INTO threads (id, user_id, title, model)
               VALUES (?, ?, ?, ?);""",
            (thread_id, user_id, title, model)
        )
        session.conn.commit()

    return {
        "id": thread_id,
        "user_id": user_id,
        "title": title,
        "model": model,
    }


def create_test_message(
    thread_id: str,
    user_id: str,
    role: str = "user",
    content: str = "What administrative discretion is granted in Section 4?",
    tokens_input: int = 40,
    tokens_output: int = 25,
) -> Dict[str, Any]:
    """Create a chat message record."""
    msg_id = str(uuid.uuid4())
    ALLOWED_TEST_IDS.add(msg_id)
    ALLOWED_TEST_IDS.add(thread_id)
    ALLOWED_TEST_IDS.add(user_id)

    with get_db_session() as session:
        cursor = session.conn.cursor()
        cursor.execute(
            """INSERT INTO messages (id, thread_id, user_id, role, content, tokens_input, tokens_output)
               VALUES (?, ?, ?, ?, ?, ?, ?);""",
            (msg_id, thread_id, user_id, role, content, tokens_input, tokens_output)
        )
        session.conn.commit()

    return {
        "id": msg_id,
        "thread_id": thread_id,
        "user_id": user_id,
        "role": role,
        "content": content,
        "tokens_input": tokens_input,
        "tokens_output": tokens_output,
    }


# ---------------------------------------------------------------------------
# 8. Mock LLM Replier Context Manager
# ---------------------------------------------------------------------------
@contextmanager
def mock_llm_reply(
    reply_text: str = "Mocked LLM Analysis: Delegation detected.",
    input_tokens: int = 150,
    output_tokens: int = 50,
    structured_data: Optional[Dict[str, Any]] = None,
):
    """
    Context manager to cleanly mock LLM execution for unit tests without hitting external APIs.
    Mocks stream_chat and parse_structured methods on LLMService, as well as get_llm / get_llm_for_model.
    """
    from app.llm.types import LLMChunk, LLMUsage
    from app.llm.registry import LLMService

    usage = LLMUsage(input_tokens=input_tokens, output_tokens=output_tokens)

    async def mock_stream(*args, **kwargs):
        yield LLMChunk(text_delta=reply_text, usage=usage, finish_reason="stop")

    async def mock_parse(*args, **kwargs):
        # schema is typically passed as positional arg 1 or keyword 'schema'
        schema = kwargs.get("schema")
        if not schema and len(args) > 1:
            schema = args[1]
        data = structured_data or {"delegate_law": 1, "discretion_rank": 4}
        if schema and hasattr(schema, "model_validate"):
            return schema.model_validate(data)
        elif schema:
            return schema(**data)
        return data

    mock_service = MagicMock(spec=LLMService)
    mock_service.stream_chat = mock_stream
    mock_service.parse_structured = mock_parse
    mock_service.model = "mock-model"
    mock_service.provider_name = "mock"

    with patch("app.llm.registry.LLMService.stream_chat", side_effect=mock_stream) as p_stream, \
         patch("app.llm.registry.LLMService.parse_structured", side_effect=mock_parse) as p_parse, \
         patch("app.llm.get_llm", return_value=mock_service), \
         patch("app.llm.registry.get_llm", return_value=mock_service) as p_get_llm, \
         patch("app.llm.get_llm_for_model", return_value=mock_service), \
         patch("app.llm.registry.get_llm_for_model", return_value=mock_service) as p_get_model_llm:
        yield {
            "stream": p_stream,
            "parse": p_parse,
            "get_llm": p_get_llm,
            "get_llm_for_model": p_get_model_llm,
            "reply_text": reply_text,
            "usage": usage,
            "service": mock_service,
        }
