import pytest
from pydantic import BaseModel
from app.tests.factories import (
    create_test_user,
    create_test_workspace,
    share_workspace_with_user,
    save_test_llm_key,
    create_test_campaign,
    link_document_to_campaign,
    create_test_workflow,
    create_test_document,
    create_test_thread,
    create_test_message,
    mock_llm_reply,
)
import app.llm
from app.core.llm_resolver import resolve_llm_credentials
from app.llm.types import LLMMessage
from unittest.mock import MagicMock


def test_user_factory():
    """Test user factory creates user with valid auth headers and JWT."""
    user = create_test_user(email="alice@university.edu", is_admin=True)
    assert user["id"] is not None
    assert user["email"] == "alice@university.edu"
    assert user["is_admin"] is True
    assert "Authorization" in user["headers"]
    assert user["headers"]["Authorization"].startswith("Bearer ")


def test_workspace_and_sharing_factories():
    """Test workspace creation and user membership sharing."""
    owner = create_test_user(email="owner@university.edu")
    ws = create_test_workspace(name="Empirical Law Lab", creator_user_id=owner["id"], creator_email=owner["email"])
    assert ws["id"].startswith("ws_")
    assert ws["name"] == "Empirical Law Lab"

    # Share with collaborator
    collaborator = create_test_user(email="collab@university.edu")
    membership = share_workspace_with_user(ws["id"], collaborator["email"], role="member")
    assert membership["workspace_id"] == ws["id"]
    assert membership["user_email"] == "collab@university.edu"
    assert membership["role"] == "member"


def test_encrypted_llm_key_factory():
    """Test encrypted key storage and integration with resolve_llm_credentials."""
    user = create_test_user(email="byok_user@university.edu")
    ws = create_test_workspace(name="BYOK Workspace")

    # 1. Save personal key
    saved_personal = save_test_llm_key(
        user_id=user["id"],
        provider="openai",
        api_key="sk-personal-super-secret",
    )
    assert saved_personal["is_configured"] is True

    # 2. Save workspace key
    saved_ws = save_test_llm_key(
        workspace_id=ws["id"],
        provider="gemini",
        api_key="AIzaSy-workspace-secret",
    )
    assert saved_ws["is_configured"] is True

    # 3. Verify resolve_llm_credentials picks decrypted personal key
    resolved_openai = resolve_llm_credentials(user["id"], ws["id"], provider="openai")
    assert resolved_openai.key_level == "personal"
    assert resolved_openai.api_key == "sk-personal-super-secret"

    # 4. Verify resolve_llm_credentials picks decrypted workspace key when no personal key
    resolved_gemini = resolve_llm_credentials(user["id"], ws["id"], provider="gemini")
    assert resolved_gemini.key_level == "workspace"
    assert resolved_gemini.api_key == "AIzaSy-workspace-secret"


def test_campaign_and_document_linking_factories():
    """Test campaign creation, document creation, and linking."""
    ws = create_test_workspace(name="Campaign Test Lab")
    campaign = create_test_campaign(
        workspace_id=ws["id"],
        name="1990s Banking Deregulation",
        prompt="Audit statutory discretion under the Gramm-Leach-Bliley Act.",
    )
    assert campaign["id"] is not None
    assert campaign["name"] == "1990s Banking Deregulation"

    doc = create_test_document(
        workspace_id=ws["id"],
        filename="Gramm_Leach_Bliley.txt",
        text_content="Public Law 106-102: To enhance competition in the financial services industry...",
    )
    assert doc["id"] is not None
    assert doc["filename"] == "Gramm_Leach_Bliley.txt"

    link = link_document_to_campaign(
        dashboard_id=campaign["id"],
        document_id=doc["id"],
        coded_values={"delegate_law": 1, "discretion_rank": 5},
    )
    assert link["coded_values"]["delegate_law"] == 1
    assert link["coded_values"]["discretion_rank"] == 5


def test_workflow_dag_factory():
    """Test workflow factory creates valid DAG definition."""
    ws = create_test_workspace(name="Workflow Test Lab")
    wf = create_test_workflow(workspace_id=ws["id"], name="2-Stage Delegation DAG")
    assert wf["id"].startswith("wf_")
    assert len(wf["definition"]["nodes"]) == 2
    assert len(wf["definition"]["edges"]) == 1


def test_chat_thread_and_messages_factory():
    """Test chat thread and message creation."""
    user = create_test_user(email="chat_user@university.edu")
    ws = create_test_workspace(name="Chat Lab")
    thread = create_test_thread(user_id=user["id"], workspace_id=ws["id"], title="Statute Query")
    assert thread["id"] is not None
    assert thread["title"] == "Statute Query"

    msg = create_test_message(
        thread_id=thread["id"],
        user_id=user["id"],
        content="Is there an explicit reporting requirement in section 102?",
    )
    assert msg["id"] is not None
    assert msg["tokens_input"] == 40


class MockDiscretionSchema(BaseModel):
    delegate_law: int
    discretion_rank: int


@pytest.mark.asyncio
async def test_mock_llm_reply_context_manager():
    """Test mock_llm_reply context manager intercepts streaming, structured parsing, and singleton resolvers."""
    with mock_llm_reply(
        reply_text="Analysis complete: broad delegation granted.",
        input_tokens=200,
        output_tokens=60,
        structured_data={"delegate_law": 1, "discretion_rank": 4},
    ):
        service = app.llm.get_llm()

        # 1. Test streaming
        chunks = []
        async for chunk in service.stream_chat([LLMMessage(role="user", content="Stream analysis")]):
            chunks.append(chunk.text_delta)
        assert "".join(chunks) == "Analysis complete: broad delegation granted."

        # 2. Test parse_structured
        parsed = await service.parse_structured(
            [LLMMessage(role="user", content="Parse rubric")],
            MockDiscretionSchema
        )
        assert parsed.delegate_law == 1
        assert parsed.discretion_rank == 4

        # 3. Test get_llm_for_model override
        model_service = app.llm.get_llm_for_model("claude-sonnet-4-5")
        model_parsed = await model_service.parse_structured(
            [LLMMessage(role="user", content="Test override")],
            MockDiscretionSchema
        )
        assert model_parsed.delegate_law == 1
