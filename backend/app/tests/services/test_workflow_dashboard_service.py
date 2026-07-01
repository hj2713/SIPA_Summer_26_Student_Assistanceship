import asyncio
import json

from app.core.database import get_db_conn
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
