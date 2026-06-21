import pytest
import json
from unittest.mock import MagicMock, AsyncMock, patch
from app.core.database import get_db_conn
from app.services import coding_service

@pytest.fixture
def clean_db():
    """Ensure dashboards and dashboard_documents are clean before each test."""
    with get_db_conn() as conn:
        conn.execute("DELETE FROM dashboard_documents;")
        conn.execute("DELETE FROM dashboards;")
        conn.execute("DELETE FROM documents;")
        conn.commit()
    yield

def test_create_campaign_unauthorized(client):
    response = client.post("/api/dashboards", json={"name": "Unauth Campaign", "prompt": "Rule 1"})
    assert response.status_code in (401, 403)

def test_create_campaign_happy_path(client, auth_headers, clean_db):
    mock_schema = {
        "description": "An agency discretion coding campaign.",
        "schema": [
            {"name": "userdefinedcol", "type": "string", "description": "User-defined column: UserDefinedCol"},
            {"name": "discretion_score", "type": "number", "description": "Discretion score"},
            {"name": "law_type", "type": "string", "description": "Type of law"}
        ]
    }
    
    with patch("app.routes.dashboards.generate_schema_and_description", return_value=mock_schema) as mock_gen:
        response = client.post(
            "/api/dashboards",
            json={
                "name": "Discretion Coding",
                "prompt": "Test system prompt for coding discretion.",
                "user_columns": ["UserDefinedCol"]
            },
            headers=auth_headers
        )
        
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Discretion Coding"
    assert data["description"] == mock_schema["description"]
    assert "id" in data
    
    # Verify saved in SQLite
    with get_db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM dashboards WHERE id = ?;", (data["id"],))
        row = cursor.fetchone()
        assert row is not None
        assert row["name"] == "Discretion Coding"
        assert "userdefinedcol" in row["schema"]

def test_list_and_get_campaigns(client, auth_headers, clean_db):
    # Insert a dashboard manually
    db_id = "test-dashboard-123"
    with get_db_conn() as conn:
        conn.execute(
            "INSERT INTO dashboards (id, workspace_id, name, description, prompt, schema) VALUES (?, 'TEST', 'Test C', 'Desc C', 'Prompt C', '[]');",
            (db_id,)
        )
        conn.commit()
        
    response = client.get("/api/dashboards", headers=auth_headers)
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["id"] == db_id
    
    response = client.get(f"/api/dashboards/{db_id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["name"] == "Test C"

def test_link_campaign_documents_and_override_cell(client, auth_headers, clean_db):
    # 1. Create campaign and document records
    db_id = "test-db-override"
    doc_id = "test-doc-override"
    
    with get_db_conn() as conn:
        conn.execute(
            "INSERT INTO dashboards (id, workspace_id, name, description, prompt, schema) VALUES (?, 'TEST', 'Campaign Override', 'Desc', 'Prompt', '[]');",
            (db_id,)
        )
        conn.execute(
            """
            INSERT INTO documents (id, user_id, workspace_id, filename, file_path, file_size, content_type, status)
            VALUES (?, '00000000-0000-0000-0000-000000000001', 'TEST', 'test_doc.txt', 'some/path', 123, 'text/plain', 'completed');
            """,
            (doc_id,)
        )
        conn.commit()
        
    # 2. Link document to campaign
    with patch("app.routes.dashboards.enqueue_sequential_coding") as mock_enqueue:
        response = client.post(
            f"/api/dashboards/{db_id}/documents/link",
            json=[doc_id],
            headers=auth_headers
        )
    assert response.status_code == 200
    mock_enqueue.assert_called_once_with(db_id, [doc_id], "00000000-0000-0000-0000-000000000001")
    
    # Check junction table record
    with get_db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT status FROM dashboard_documents WHERE dashboard_id = ? AND document_id = ?;", (db_id, doc_id))
        row = cursor.fetchone()
        assert row is not None
        assert row["status"] == "pending"

    # 3. Human override PUT cell
    response = client.put(
        f"/api/dashboards/{db_id}/documents/{doc_id}",
        json={"column_name": "VariableA", "value": "High"},
        headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["coded_values"]["VariableA"] == "High"

    # Verify override in DB
    with get_db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT coded_values FROM dashboard_documents WHERE dashboard_id = ? AND document_id = ?;", (db_id, doc_id))
        row = cursor.fetchone()
        assert json.loads(row[0])["VariableA"] == "High"

def test_delete_campaign(client, auth_headers, clean_db):
    db_id = "test-dashboard-delete"
    with get_db_conn() as conn:
        conn.execute(
            "INSERT INTO dashboards (id, workspace_id, name, description, prompt, schema) VALUES (?, 'TEST', 'To Delete', 'Desc', 'Prompt', '[]');",
            (db_id,)
        )
        conn.commit()

    response = client.delete(f"/api/dashboards/{db_id}", headers=auth_headers)
    assert response.status_code == 240 or response.status_code == 204
    
    # Check deleted in DB
    with get_db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM dashboards WHERE id = ?;", (db_id,))
        assert cursor.fetchone() is None


def test_update_campaign_details_and_schema(client, auth_headers, clean_db):
    db_id = "test-dashboard-update-settings"
    with get_db_conn() as conn:
        conn.execute(
            "INSERT INTO dashboards (id, workspace_id, name, description, prompt, schema) VALUES (?, 'TEST', 'Old Name', 'Old Desc', 'Old Prompt', '[]');",
            (db_id,)
        )
        conn.commit()

    updated_schema = [
        {"name": "score", "type": "number", "description": "Agency discretion rank", "options": ["0", "1", "2"]}
    ]
    
    response = client.put(
        f"/api/dashboards/{db_id}",
        json={
            "name": "New Name",
            "description": "New Desc",
            "prompt": "New Prompt",
            "schema": updated_schema
        },
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "New Name"
    assert data["description"] == "New Desc"
    assert data["prompt"] == "New Prompt"
    assert len(data["schema"]) == 1
    assert data["schema"][0]["name"] == "score"

    # Verify updated in DB
    with get_db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM dashboards WHERE id = ?;", (db_id,))
        row = cursor.fetchone()
        assert row["name"] == "New Name"
        assert row["description"] == "New Desc"
        assert row["prompt"] == "New Prompt"
        assert "score" in row["schema"]


def test_override_cell_value_and_reasoning(client, auth_headers, clean_db):
    db_id = "test-db-override-reason"
    doc_id = "test-doc-override-reason"
    with get_db_conn() as conn:
        conn.execute(
            "INSERT INTO dashboards (id, workspace_id, name, description, prompt, schema) VALUES (?, 'TEST', 'Campaign Override', 'Desc', 'Prompt', '[]');",
            (db_id,)
        )
        conn.execute(
            """
            INSERT INTO documents (id, user_id, workspace_id, filename, file_path, file_size, content_type, status)
            VALUES (?, '00000000-0000-0000-0000-000000000001', 'TEST', 'test_doc.txt', 'some/path', 123, 'text/plain', 'completed');
            """,
            (doc_id,)
        )
        conn.execute(
            "INSERT INTO dashboard_documents (dashboard_id, document_id, status) VALUES (?, ?, 'completed');",
            (db_id, doc_id)
        )
        conn.commit()

    response = client.put(
        f"/api/dashboards/{db_id}/documents/{doc_id}",
        json={
            "column_name": "delegatelaw",
            "value": "Y",
            "reasoning": "Corrected because of section 4 delegation."
        },
        headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["coded_values"]["delegatelaw"] == "Y"
    assert body["coded_values"]["delegatelaw_reasoning"] == "Corrected because of section 4 delegation."


def test_history_tracking_on_manual_override(client, auth_headers, clean_db):
    db_id = "test-db-override-history"
    doc_id = "test-doc-override-history"
    with get_db_conn() as conn:
        conn.execute(
            "INSERT INTO dashboards (id, workspace_id, name, description, prompt, schema) VALUES (?, 'TEST', 'Campaign Override History', 'Desc', 'Prompt', '[]');",
            (db_id,)
        )
        conn.execute(
            """
            INSERT INTO documents (id, user_id, workspace_id, filename, file_path, file_size, content_type, status)
            VALUES (?, '00000000-0000-0000-0000-000000000001', 'TEST', 'test_doc.txt', 'some/path', 123, 'text/plain', 'completed');
            """,
            (doc_id,)
        )
        conn.execute(
            "INSERT INTO dashboard_documents (dashboard_id, document_id, status, coded_values) VALUES (?, ?, 'completed', ?);",
            (db_id, doc_id, json.dumps({"delegatelaw": "OldVal", "delegatelaw_reasoning": "OldReason"}))
        )
        conn.commit()

    # First override
    response = client.put(
        f"/api/dashboards/{db_id}/documents/{doc_id}",
        json={
            "column_name": "delegatelaw",
            "value": "Override1",
            "reasoning": "My Override 1 reasoning"
        },
        headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["coded_values"]["delegatelaw"] == "Override1"
    assert body["coded_values"]["delegatelaw_reasoning"] == "My Override 1 reasoning"
    
    history = body["coded_values"]["delegatelaw_history"]
    assert len(history) == 2
    assert history[0]["version"] == 1
    assert history[0]["value"] == "OldVal"
    assert history[0]["source"] == "ai"
    
    assert history[1]["version"] == 2
    assert history[1]["value"] == "Override1"
    assert history[1]["reasoning"] == "My Override 1 reasoning"
    assert history[1]["source"] == "user_override"

    # Second override
    response = client.put(
        f"/api/dashboards/{db_id}/documents/{doc_id}",
        json={
            "column_name": "delegatelaw",
            "value": "Override2",
            "reasoning": "My Override 2 reasoning"
        },
        headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["coded_values"]["delegatelaw"] == "Override2"
    assert body["coded_values"]["delegatelaw_reasoning"] == "My Override 2 reasoning"
    
    history = body["coded_values"]["delegatelaw_history"]
    assert len(history) == 3
    assert history[2]["version"] == 3
    assert history[2]["value"] == "Override2"
    assert history[2]["reasoning"] == "My Override 2 reasoning"
    assert history[2]["source"] == "user_override"


def test_cell_reevaluation_ai(client, auth_headers, clean_db):
    db_id = "test-db-reeval"
    doc_id = "test-doc-reeval"
    schema = [{"name": "delegatelaw", "type": "string", "description": "Is it delegated?"}]
    
    with get_db_conn() as conn:
        conn.execute(
            "INSERT INTO dashboards (id, workspace_id, name, description, prompt, schema) VALUES (?, 'TEST', 'Campaign Reeval', 'Desc', 'Prompt', ?);",
            (db_id, json.dumps(schema))
        )
        conn.execute(
            """
            INSERT INTO documents (id, user_id, workspace_id, filename, file_path, file_size, content_type, status)
            VALUES (?, '00000000-0000-0000-0000-000000000001', 'TEST', 'test_doc.txt', 'some/path', 123, 'text/plain', 'completed');
            """,
            (doc_id,)
        )
        conn.execute(
            "INSERT INTO document_chunks (id, document_id, user_id, content, embedding, metadata) VALUES (?, ?, '00000000-0000-0000-0000-000000000001', 'This is document text.', '[]', '{}');",
            ("chunk-reeval-1", doc_id)
        )
        conn.execute(
            "INSERT INTO dashboard_documents (dashboard_id, document_id, status, coded_values) VALUES (?, ?, 'completed', ?);",
            (db_id, doc_id, json.dumps({"delegatelaw": "OldVal", "delegatelaw_reasoning": "OldReason"}))
        )
        conn.commit()

    # Mock get_llm
    mock_parsed = MagicMock()
    mock_parsed.value = "NewVal"
    mock_parsed.reasoning = "NewReasoning based on user feedback."
    
    mock_llm = MagicMock()
    mock_llm.parse_structured = AsyncMock(return_value=mock_parsed)
    
    with patch("app.llm.registry.get_llm", return_value=mock_llm):
        response = client.post(
            f"/api/dashboards/{db_id}/documents/{doc_id}/re-evaluate",
            json={
                "column_name": "delegatelaw",
                "user_prompt": "Actually it should be NewVal"
            },
            headers=auth_headers
        )
        
    assert response.status_code == 200
    body = response.json()
    assert body["coded_values"]["delegatelaw"] == "NewVal"
    assert body["coded_values"]["delegatelaw_reasoning"] == "NewReasoning based on user feedback."
    
    # Check history is populated
    history = body["coded_values"]["delegatelaw_history"]
    assert len(history) == 2
    assert history[0]["version"] == 1
    assert history[0]["value"] == "OldVal"
    assert history[0]["source"] == "ai"
    
    assert history[1]["version"] == 2
    assert history[1]["value"] == "NewVal"
    assert history[1]["reasoning"] == "NewReasoning based on user feedback."
    assert history[1]["feedback_prompt"] == "Actually it should be NewVal"
    assert history[1]["source"] == "ai_reevaluation"


def test_regenerate_campaign_schema(client, auth_headers, clean_db):
    db_id = "test-db-regenerate-schema"
    with get_db_conn() as conn:
        conn.execute(
            "INSERT INTO dashboards (id, workspace_id, name, description, prompt, schema) VALUES (?, 'TEST', 'Regen Schema', 'Old Desc', 'Test Prompt', '[]');",
            (db_id,)
        )
        conn.commit()

    mock_schema = {
        "description": "Regenerated Desc",
        "schema": [
            {"name": "score", "type": "number", "description": "extracted score"}
        ]
    }

    with patch("app.services.campaign_service.campaign_service._coding_service.generate_schema_and_description", return_value=mock_schema):
        response = client.post(
            f"/api/dashboards/{db_id}/regenerate-schema",
            headers=auth_headers
        )

    assert response.status_code == 200
    data = response.json()
    assert data["description"] == "Regenerated Desc"
    assert len(data["schema"]) == 1
    assert data["schema"][0]["name"] == "score"

    # Verify updated in DB
    with get_db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT schema, description FROM dashboards WHERE id = ?;", (db_id,))
        row = cursor.fetchone()
        assert row["description"] == "Regenerated Desc"
        assert "score" in row["schema"]


def test_create_campaign_with_structured_columns(client, auth_headers, clean_db):
    mock_schema = {
        "description": "Structured columns coding campaign.",
        "schema": [
            {"name": "customcol", "type": "boolean", "description": "Custom col description", "options": None},
            {"name": "score", "type": "number", "description": "some score", "options": None}
        ]
    }
    
    with patch("app.routes.dashboards.generate_schema_and_description", return_value=mock_schema) as mock_gen:
        response = client.post(
            "/api/dashboards",
            json={
                "name": "Structured Cols Campaign",
                "prompt": "Test prompt.",
                "user_columns": [
                    {"name": "CustomCol", "type": "boolean", "description": "Custom col description"},
                    "score"
                ]
            },
            headers=auth_headers
        )
        
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Structured Cols Campaign"
    assert "id" in data

    



def test_column_reevaluation_endpoint(client, auth_headers, clean_db):
    db_id = "test-db-col-reeval"
    doc_id = "test-doc-col-reeval"
    schema = [{"name": "delegatelaw", "type": "string", "description": "Is it delegated?"}]
    
    with get_db_conn() as conn:
        conn.execute(
            "INSERT INTO dashboards (id, workspace_id, name, description, prompt, schema) VALUES (?, 'TEST', 'Col Reeval', 'Desc', 'Prompt', ?);",
            (db_id, json.dumps(schema))
        )
        conn.execute(
            """
            INSERT INTO documents (id, user_id, workspace_id, filename, file_path, file_size, content_type, status)
            VALUES (?, '00000000-0000-0000-0000-000000000001', 'TEST', 'test_doc.txt', 'some/path', 123, 'text/plain', 'completed');
            """,
            (doc_id,)
        )
        conn.execute(
            "INSERT INTO document_chunks (id, document_id, user_id, content, embedding, metadata) VALUES (?, ?, '00000000-0000-0000-0000-000000000001', 'Document content.', '[]', '{}');",
            ("chunk-col-reeval-1", doc_id)
        )
        conn.execute(
            "INSERT INTO dashboard_documents (dashboard_id, document_id, status, coded_values) VALUES (?, ?, 'completed', ?);",
            (db_id, doc_id, json.dumps({"delegatelaw": "OldVal", "delegatelaw_reasoning": "OldReason"}))
        )
        conn.commit()

    mock_parsed = MagicMock()
    mock_parsed.value = "NewValColumn"
    mock_parsed.reasoning = "New reasoning for column."
    
    mock_llm = MagicMock()
    mock_llm.parse_structured = AsyncMock(return_value=mock_parsed)
    
    with patch("app.llm.registry.get_llm", return_value=mock_llm):
        response = client.post(
            f"/api/dashboards/{db_id}/columns/delegatelaw/reevaluate",
            json={"feedback_prompt": "Force NewValColumn everywhere"},
            headers=auth_headers
        )
        
    assert response.status_code == 200
    data = response.json()
    assert len(data["schema"]) == 1
    assert data["schema"][0]["prompt_version"] == 2
    assert len(data["schema"][0]["prompt_history"]) == 2

    # Verify document values updated
    with get_db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT coded_values FROM dashboard_documents WHERE dashboard_id = ? AND document_id = ?;", (db_id, doc_id))
        row = cursor.fetchone()
        coded = json.loads(row[0])
        assert coded["delegatelaw"] == "NewValColumn"
        assert coded["delegatelaw_reasoning"] == "New reasoning for column."
        assert len(coded["delegatelaw_history"]) == 2
        assert coded["delegatelaw_history"][1]["feedback_prompt"] == "Force NewValColumn everywhere"


def test_row_reevaluation_endpoint(client, auth_headers, clean_db):
    db_id = "test-db-row-reeval"
    doc_id = "test-doc-row-reeval"
    schema = [
        {"name": "delegatelaw", "type": "string", "description": "Is it delegated?"},
        {"name": "spendlimits", "type": "boolean", "description": "Spend limit presence?"}
    ]
    
    with get_db_conn() as conn:
        conn.execute(
            "INSERT INTO dashboards (id, workspace_id, name, description, prompt, schema) VALUES (?, 'TEST', 'Row Reeval', 'Desc', 'Prompt', ?);",
            (db_id, json.dumps(schema))
        )
        conn.execute(
            """
            INSERT INTO documents (id, user_id, workspace_id, filename, file_path, file_size, content_type, status)
            VALUES (?, '00000000-0000-0000-0000-000000000001', 'TEST', 'test_doc.txt', 'some/path', 123, 'text/plain', 'completed');
            """,
            (doc_id,)
        )
        conn.execute(
            "INSERT INTO document_chunks (id, document_id, user_id, content, embedding, metadata) VALUES (?, ?, '00000000-0000-0000-0000-000000000001', 'Document content.', '[]', '{}');",
            ("chunk-row-reeval-1", doc_id)
        )
        conn.execute(
            "INSERT INTO dashboard_documents (dashboard_id, document_id, status, coded_values) VALUES (?, ?, 'completed', ?);",
            (db_id, doc_id, json.dumps({
                "delegatelaw": "OldVal", "delegatelaw_reasoning": "OldReason",
                "spendlimits": False, "spendlimits_reasoning": "No mention"
            }))
        )
        conn.commit()

    mock_row_res = MagicMock()
    mock_delegatelaw = MagicMock()
    mock_delegatelaw.value = "NewValRow"
    mock_delegatelaw.reasoning = "New reasoning for row delegatelaw."
    mock_spendlimits = MagicMock()
    mock_spendlimits.value = True
    mock_spendlimits.reasoning = "New reasoning for row spendlimits."
    
    setattr(mock_row_res, "delegatelaw", mock_delegatelaw)
    setattr(mock_row_res, "spendlimits", mock_spendlimits)
    
    mock_llm = MagicMock()
    mock_llm.parse_structured = AsyncMock(return_value=mock_row_res)
    
    with patch("app.llm.registry.get_llm", return_value=mock_llm):
        response = client.post(
            f"/api/dashboards/{db_id}/documents/{doc_id}/reevaluate-row",
            json={"feedback_prompt": "Correct everything please"},
            headers=auth_headers
        )
        
    assert response.status_code == 200
    body = response.json()
    assert body["coded_values"]["delegatelaw"] == "NewValRow"
    assert body["coded_values"]["spendlimits"] is True
    assert len(body["coded_values"]["delegatelaw_history"]) == 2
    assert body["coded_values"]["delegatelaw_history"][1]["feedback_prompt"] == "Correct everything please"
