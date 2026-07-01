import asyncio
import json

from app.core.database import get_db_conn
from app.core.request_context import get_current_user_id
from app.services.workflow_dashboard_service import WorkflowDashboardService


def test_run_model_comparison_parallel_persists_all_models():
    dashboard_id = "workflow-dash-1"
    document_id = "workflow-doc-1"

    with get_db_conn() as conn:
        conn.execute(
            "INSERT INTO dashboards (id, workspace_id, name, description, prompt, schema, model, dashboard_type) VALUES (?, 'QA', 'Workflow Eval', '', '', '[]', 'gemini-3.1-flash-lite,deepseek-v4-flash', 'model_comparison');",
            (dashboard_id,),
        )
        conn.execute(
            "INSERT INTO documents (id, user_id, workspace_id, filename, file_path, file_size, content_type, status, metadata) VALUES (?, '00000000-0000-0000-0000-000000000001', 'QA', 'law.txt', '/tmp/law.txt', 10, 'text/plain', 'completed', '{}');",
            (document_id,),
        )
        conn.execute(
            "INSERT INTO dashboard_documents (dashboard_id, document_id, coded_values, status) VALUES (?, ?, '{}', 'processing');",
            (dashboard_id, document_id),
        )
        conn.commit()

    service = WorkflowDashboardService()

    async def fake_run_model_for_document(dash_id, doc_id, definition, model, source_text, schema_fields, token_limit):
        await asyncio.sleep(0.01 if "gemini" in model else 0.02)
        return {
            "status": "completed",
            "values": {"delegate_law": model},
            "cost": 0.0,
            "input_tokens": 1,
            "output_tokens": 1,
            "trace": [{"node_id": model, "status": "completed"}],
            "context": {"model": model},
            "error_message": None,
            "error_type": None,
        }

    service._document_text = lambda _doc_id: "Test source text"
    service._run_model_for_document = fake_run_model_for_document

    asyncio.run(
        service.run_model_comparison_parallel(
            dashboard_id=dashboard_id,
            document_ids=[document_id],
            models=["gemini-3.1-flash-lite", "deepseek-v4-flash"],
            definition={"nodes": [], "edges": [], "outputs": []},
            schema_fields=[],
            token_limit=2500000,
        )
    )

    with get_db_conn() as conn:
        row = conn.execute(
            "SELECT coded_values, status FROM dashboard_documents WHERE dashboard_id = ? AND document_id = ?;",
            (dashboard_id, document_id),
        ).fetchone()

    coded = json.loads(row["coded_values"])
    assert row["status"] == "completed"
    assert coded["gemini-3.1-flash-lite"]["values"]["delegate_law"] == "gemini-3.1-flash-lite"
    assert coded["deepseek-v4-flash"]["values"]["delegate_law"] == "deepseek-v4-flash"


def test_run_model_comparison_parallel_marks_models_failed_when_document_load_crashes():
    dashboard_id = "workflow-dash-crash"
    document_id = "workflow-doc-crash"

    with get_db_conn() as conn:
        conn.execute(
            "INSERT INTO dashboards (id, workspace_id, name, description, prompt, schema, model, dashboard_type) VALUES (?, 'QA', 'Workflow Eval Crash', '', '', '[]', 'gemini-3.1-flash-lite,deepseek-v4-flash', 'model_comparison');",
            (dashboard_id,),
        )
        conn.execute(
            "INSERT INTO documents (id, user_id, workspace_id, filename, file_path, file_size, content_type, status, metadata) VALUES (?, '00000000-0000-0000-0000-000000000001', 'QA', 'law.txt', '/tmp/law.txt', 10, 'text/plain', 'completed', '{}');",
            (document_id,),
        )
        conn.execute(
            "INSERT INTO dashboard_documents (dashboard_id, document_id, coded_values, status) VALUES (?, ?, '{}', 'processing');",
            (dashboard_id, document_id),
        )
        conn.commit()

    service = WorkflowDashboardService()
    service._document_text = lambda _doc_id: (_ for _ in ()).throw(RuntimeError("storage unavailable"))

    asyncio.run(
        service.run_model_comparison_parallel(
            dashboard_id=dashboard_id,
            document_ids=[document_id],
            models=["gemini-3.1-flash-lite", "deepseek-v4-flash"],
            definition={"nodes": [], "edges": [], "outputs": []},
            schema_fields=[],
            token_limit=2500000,
        )
    )

    with get_db_conn() as conn:
        row = conn.execute(
            "SELECT coded_values, status, error_message FROM dashboard_documents WHERE dashboard_id = ? AND document_id = ?;",
            (dashboard_id, document_id),
        ).fetchone()

    coded = json.loads(row["coded_values"])
    assert row["status"] == "failed"
    assert "storage unavailable" in row["error_message"]
    assert coded["gemini-3.1-flash-lite"]["status"] == "failed"
    assert coded["deepseek-v4-flash"]["status"] == "failed"


def test_run_model_comparison_parallel_retry_model_only_runs_requested_model():
    dashboard_id = "workflow-dash-retry-one"
    document_id = "workflow-doc-retry-one"

    existing = {
        "gemini-3.1-flash-lite": {
            "values": {},
            "status": "failed",
            "error_message": "gemini failed",
            "error_type": "API_FAILURE",
        },
        "deepseek-v4-flash": {
            "values": {},
            "status": "failed",
            "error_message": "deepseek failed",
            "error_type": "API_FAILURE",
        },
    }

    with get_db_conn() as conn:
        conn.execute(
            "INSERT INTO dashboards (id, workspace_id, name, description, prompt, schema, model, dashboard_type) VALUES (?, 'QA', 'Workflow Eval Retry One', '', '', '[]', 'gemini-3.1-flash-lite,deepseek-v4-flash', 'model_comparison');",
            (dashboard_id,),
        )
        conn.execute(
            "INSERT INTO documents (id, user_id, workspace_id, filename, file_path, file_size, content_type, status, metadata) VALUES (?, '00000000-0000-0000-0000-000000000001', 'QA', 'law.txt', '/tmp/law.txt', 10, 'text/plain', 'completed', '{}');",
            (document_id,),
        )
        conn.execute(
            "INSERT INTO dashboard_documents (dashboard_id, document_id, coded_values, status) VALUES (?, ?, ?, 'failed');",
            (dashboard_id, document_id, json.dumps(existing)),
        )
        conn.commit()

    service = WorkflowDashboardService()
    invoked_models: list[str] = []

    async def fake_run_model_for_document(dash_id, doc_id, definition, model, source_text, schema_fields, token_limit):
        invoked_models.append(model)
        return {
            "status": "completed",
            "values": {"delegate_law": model},
            "cost": 0.0,
            "input_tokens": 1,
            "output_tokens": 1,
            "trace": [{"node_id": model, "status": "completed"}],
            "context": {"model": model},
            "error_message": None,
            "error_type": None,
        }

    service._document_text = lambda _doc_id: "Test source text"
    service._run_model_for_document = fake_run_model_for_document

    asyncio.run(
        service.run_model_comparison_parallel(
            dashboard_id=dashboard_id,
            document_ids=[document_id],
            models=["gemini-3.1-flash-lite", "deepseek-v4-flash"],
            definition={"nodes": [], "edges": [], "outputs": []},
            schema_fields=[],
            token_limit=2500000,
            retry_model="gemini-3.1-flash-lite",
        )
    )

    with get_db_conn() as conn:
        row = conn.execute(
            "SELECT coded_values, status FROM dashboard_documents WHERE dashboard_id = ? AND document_id = ?;",
            (dashboard_id, document_id),
        ).fetchone()

    coded = json.loads(row["coded_values"])
    assert invoked_models == ["gemini-3.1-flash-lite"]
    assert coded["gemini-3.1-flash-lite"]["status"] == "completed"
    assert coded["deepseek-v4-flash"]["status"] == "failed"
    assert row["status"] == "failed"


def test_run_model_comparison_parallel_propagates_user_context_to_model_runs():
    dashboard_id = "workflow-dash-user-context"
    document_id = "workflow-doc-user-context"

    with get_db_conn() as conn:
        conn.execute(
            "INSERT INTO dashboards (id, workspace_id, name, description, prompt, schema, model, dashboard_type) VALUES (?, 'QA', 'Workflow Eval User Context', '', '', '[]', 'claude-sonnet-4.6', 'model_comparison');",
            (dashboard_id,),
        )
        conn.execute(
            "INSERT INTO documents (id, user_id, workspace_id, filename, file_path, file_size, content_type, status, metadata) VALUES (?, '00000000-0000-0000-0000-000000000001', 'QA', 'law.txt', '/tmp/law.txt', 10, 'text/plain', 'completed', '{}');",
            (document_id,),
        )
        conn.execute(
            "INSERT INTO dashboard_documents (dashboard_id, document_id, coded_values, status) VALUES (?, ?, '{}', 'processing');",
            (dashboard_id, document_id),
        )
        conn.commit()

    service = WorkflowDashboardService()
    observed_user_ids: list[str | None] = []

    async def fake_run_model_for_document(dash_id, doc_id, definition, model, source_text, schema_fields, token_limit):
        observed_user_ids.append(get_current_user_id())
        return {
            "status": "completed",
            "values": {"delegate_law": model},
            "cost": 0.0,
            "input_tokens": 1,
            "output_tokens": 1,
            "trace": [{"node_id": model, "status": "completed"}],
            "context": {"model": model},
            "error_message": None,
            "error_type": None,
        }

    service._document_text = lambda _doc_id: "Test source text"
    service._run_model_for_document = fake_run_model_for_document

    asyncio.run(
        service.run_model_comparison_parallel(
            dashboard_id=dashboard_id,
            document_ids=[document_id],
            models=["claude-sonnet-4.6"],
            definition={"nodes": [], "edges": [], "outputs": []},
            schema_fields=[],
            token_limit=2500000,
            user_id="user-anthropic",
        )
    )

    assert observed_user_ids == ["user-anthropic"]
