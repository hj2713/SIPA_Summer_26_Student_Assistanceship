import pytest
import json
from unittest.mock import patch

from app.core.database import get_db_conn
from app.services.campaign_service import campaign_service
from app.tests.conftest import TEST_USER_ID

def test_create_evaluation_campaign_requires_auth(client):
    response = client.post("/api/dashboards", json={
        "name": "Test multi model",
        "prompt": "Extract delegation",
        "model": "gemini-3.1-flash-lite,gpt-4o-mini",
        "dashboard_type": "model_comparison"
    })
    assert response.status_code in (401, 403)

def test_create_evaluation_campaign_happy_path(client, auth_headers):
    # Mock schema generation to avoid API calls during test
    from unittest.mock import AsyncMock, patch
    with patch("app.routes.dashboards.generate_schema_and_description", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = {
            "description": "Test campaign description",
            "schema": [{"name": "delegate_law", "type": "boolean", "description": "Is law delegating"}]
        }
        response = client.post("/api/dashboards", json={
            "name": "Test Multi-Model Run",
            "prompt": "Find delegation",
            "model": "gemini-3.1-flash-lite,gpt-4o-mini",
            "dashboard_type": "model_comparison",
            "token_limit": 3000000
        }, headers=auth_headers)
        
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test Multi-Model Run"
        assert data["dashboard_type"] == "model_comparison"
        assert data["model"] == "gemini-3.1-flash-lite,gpt-4o-mini"
        assert data["token_limit"] == 3000000

def test_raise_token_limit_happy_path(client, auth_headers):
    # First create a dashboard
    from unittest.mock import AsyncMock, patch
    with patch("app.routes.dashboards.generate_schema_and_description", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = {
            "description": "Test",
            "schema": []
        }
        res = client.post("/api/dashboards", json={
            "name": "Test Limit Raise",
            "prompt": "Find delegation",
            "model": "gemini-3.1-flash-lite,gpt-4o-mini",
            "dashboard_type": "model_comparison",
            "token_limit": 1000000
        }, headers=auth_headers)
        dashboard_id = res.json()["id"]

    # Raise token limit
    with patch("app.services.campaign_service.campaign_service.retry_failed_documents") as mock_retry:
        mock_retry.return_value = []
        response = client.post(f"/api/dashboards/{dashboard_id}/raise-token-limit", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["new_limit"] == 6000000
        mock_retry.assert_called_once()


def test_add_model_to_campaign_happy_path(client, auth_headers):
    from unittest.mock import AsyncMock, patch
    with patch("app.routes.dashboards.generate_schema_and_description", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = {
            "description": "Test",
            "schema": []
        }
        res = client.post("/api/dashboards", json={
            "name": "Test Add Model",
            "prompt": "Find delegation",
            "model": "gemini-3.1-flash-lite",
            "dashboard_type": "model_comparison",
            "token_limit": 1000000
        }, headers=auth_headers)
        dashboard_id = res.json()["id"]

    with patch("app.services.campaign_service.campaign_service.retry_failed_documents") as mock_retry:
        mock_retry.return_value = ["doc1", "doc2"]
        response = client.post(f"/api/dashboards/{dashboard_id}/add-model?model=gpt-4o-mini", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "gpt-4o-mini" in data["model"]
        assert "gemini-3.1-flash-lite" in data["model"]
        assert "queued 2 documents" in data["message"]
        mock_retry.assert_called_once_with(dashboard_id, '00000000-0000-0000-0000-000000000001', payload=None, retry_model="gpt-4o-mini")


def test_link_workflow_to_campaign_rejects_mismatched_schema(client, auth_headers):
    from unittest.mock import AsyncMock, patch

    with patch("app.routes.dashboards.generate_schema_and_description", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = {
            "description": "Mismatch campaign",
            "schema": [
                {"name": "delegate_law", "type": "boolean"},
                {"name": "some_other_column", "type": "string"},
            ],
        }
        campaign_res = client.post("/api/dashboards", json={
            "name": "Mismatch campaign",
            "prompt": "Extract delegation",
            "model": "gemini-3.1-flash-lite,gpt-4o-mini",
            "dashboard_type": "model_comparison",
            "user_columns": [
                {"name": "delegate_law", "type": "boolean"},
                {"name": "some_other_column", "type": "string"},
            ],
        }, headers=auth_headers)
        assert campaign_res.status_code == 201
        campaign_id = campaign_res.json()["id"]

    workflow_res = client.post(
        "/api/workflows?workspace_id=QA",
        headers=auth_headers,
        json={
            "name": "Law Delegation + Discretion Rank",
            "description": "Project-specific workflow",
            "template": "law_delegation_discretion_rank",
        },
    )
    assert workflow_res.status_code == 201
    workflow_id = workflow_res.json()["id"]

    link_res = client.patch(
        f"/api/dashboards/{campaign_id}/link-workflow",
        headers=auth_headers,
        json={"workflow_id": workflow_id},
    )
    assert link_res.status_code == 409
    assert "Workflow outputs do not match the campaign schema" in link_res.json()["detail"]


def test_link_workflow_to_campaign_merges_matching_schema_workflow_sources(client, auth_headers):
    from unittest.mock import AsyncMock, patch

    with patch("app.routes.dashboards.generate_schema_and_description", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = {
            "description": "Matching campaign",
            "schema": [
                {"name": "delegate_law", "type": "boolean", "description": "Prompt column 1"},
                {"name": "discretion_rank", "type": "number", "description": "Prompt column 2"},
            ],
        }
        campaign_res = client.post("/api/dashboards", json={
            "name": "Matching campaign",
            "prompt": "Extract delegation and rank",
            "model": "gemini-3.1-flash-lite,gpt-4o-mini",
            "dashboard_type": "model_comparison",
            "user_columns": [
                {"name": "delegate_law", "type": "boolean", "description": "Prompt column 1"},
                {"name": "discretion_rank", "type": "number", "description": "Prompt column 2"},
            ],
        }, headers=auth_headers)
        assert campaign_res.status_code == 201
        campaign_id = campaign_res.json()["id"]

    workflow_res = client.post(
        "/api/workflows?workspace_id=QA",
        headers=auth_headers,
        json={
            "name": "Law Delegation + Discretion Rank",
            "description": "Project-specific workflow",
            "template": "law_delegation_discretion_rank",
        },
    )
    assert workflow_res.status_code == 201
    workflow_id = workflow_res.json()["id"]

    link_res = client.patch(
        f"/api/dashboards/{campaign_id}/link-workflow",
        headers=auth_headers,
        json={"workflow_id": workflow_id},
    )
    assert link_res.status_code == 200
    schema = link_res.json()["schema"]
    assert [col["name"] for col in schema] == ["delegate_law", "discretion_rank"]
    assert schema[0]["workflow_source"] == "law_delegation.delegate_law"
    assert schema[1]["workflow_source"] == "discretion_rank"


def test_linked_evaluation_dashboard_runs_workflow_on_same_dashboard(client, auth_headers):
    dashboard_id = "eval-dashboard-linked"
    document_id = "10000000-0000-0000-0000-000000009999"
    workflow_response = client.post(
        "/api/workflows?workspace_id=QA",
        headers=auth_headers,
        json={
            "name": "Eval workflow",
            "description": "Used for linked dashboard routing",
            "template": "law_delegation_discretion_rank",
        },
    )
    assert workflow_response.status_code == 201
    workflow = workflow_response.json()
    workflow_id = workflow["id"]

    with get_db_conn() as conn:
        conn.execute(
            """
            INSERT INTO dashboards (
                id, workspace_id, name, description, prompt, schema, model, dashboard_type,
                workflow_id, workflow_source, workflow_definition_json
            ) VALUES (?, 'QA', 'Eval Linked', '', 'Prompt', '[]', 'gemini-3.1-flash-lite,gpt-4o-mini', 'model_comparison', ?, 'draft', '{"nodes":[],"edges":[],"outputs":[]}');
            """,
            (dashboard_id, workflow_id),
        )
        conn.execute(
            """
            INSERT INTO documents (id, user_id, workspace_id, filename, file_path, file_size, content_type, status, metadata)
            VALUES (?, ?, 'QA', 'linked-law.txt', '/tmp/linked-law.txt', 10, 'text/plain', 'completed', '{}');
            """,
            (document_id, TEST_USER_ID),
        )
        conn.commit()

    with patch(
        "app.services.workflow_dashboard_service.workflow_dashboard_service.run_existing_documents_for_dashboard",
    ) as mock_run, patch.object(campaign_service._coding_service, "schedule_coroutine") as mock_schedule:
        campaign_service.link_campaign_documents(dashboard_id, [document_id], TEST_USER_ID)

    mock_run.assert_called_once_with(
        dashboard_id=dashboard_id,
        workflow_id=workflow_id,
        workspace_id="QA",
        user_id=TEST_USER_ID,
        document_ids=[document_id],
        source="draft",
        version=None,
        rerun_document_ids={document_id},
        retry_model=None,
    )
    mock_schedule.assert_called_once()
    scheduled_coro = mock_schedule.call_args.args[0]
    scheduled_coro.close()

    with get_db_conn() as conn:
        row = conn.execute(
            "SELECT status FROM dashboard_documents WHERE dashboard_id = ? AND document_id = ?;",
            (dashboard_id, document_id),
        ).fetchone()
    assert row is not None
    assert row["status"] == "pending"
