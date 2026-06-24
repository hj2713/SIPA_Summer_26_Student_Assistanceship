import json
import logging
import uuid
from pathlib import Path
from typing import Any, Literal

from fastapi import HTTPException, UploadFile, status

from app.core.constants import ALLOWED_EXTENSIONS, MAX_FILE_SIZE_BYTES
from app.repositories import get_db_session
from app.schemas.dashboard import DashboardDocumentRow, DashboardRow
from app.schemas.document import DocumentStatus
from app.services.campaign_service import campaign_service
from app.services.document_service import document_service
from app.services.ingestion_service import ingestion_service, extract_text
from app.services.workflow_service import workflow_service
from app.workflows.executor import WorkflowExecutionError, workflow_executor

logger = logging.getLogger(__name__)

WorkflowSource = Literal["draft", "published"]


class WorkflowDashboardService:
    def __init__(self, db_session_factory=get_db_session):
        self.db_session_factory = db_session_factory

    def _definition_and_meta(
        self,
        workflow_id: str,
        workspace_id: str,
        source: WorkflowSource = "draft",
        version: int | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any], str]:
        if source == "published":
            workflow = workflow_service.get(workflow_id, workspace_id)
            selected_version = version or workflow.latest_version
            if not selected_version:
                raise HTTPException(status_code=400, detail="Publish this workflow before running a published workflow dashboard.")
            version_row = workflow_service.get_version(workflow_id, selected_version, workspace_id)
            return (
                version_row.definition.model_dump(),
                {
                    "workflow_source": "published",
                    "workflow_version": version_row.version,
                    "workflow_revision": None,
                },
                workflow.name,
            )
        workflow = workflow_service.get(workflow_id, workspace_id)
        return (
            workflow.definition.model_dump(),
            {
                "workflow_source": "draft",
                "workflow_version": None,
                "workflow_revision": workflow.revision,
            },
            workflow.name,
        )

    def _schema_from_outputs(self, definition: dict[str, Any]) -> list[dict[str, Any]]:
        fields = []
        for output in definition.get("outputs") or []:
            key = output.get("key") or str(output.get("source") or "").split(".")[-1]
            if not key:
                continue
            fields.append({
                "name": key,
                "type": "string",
                "description": f"Final workflow output from {output.get('source', key)}",
                "workflow_source": output.get("source"),
            })
        if fields:
            return fields
        output_nodes = [node for node in definition.get("nodes") or [] if node.get("kind") == "output"]
        for field in (output_nodes[-1].get("config", {}).get("fields") if output_nodes else []) or []:
            if isinstance(field, dict):
                key = field.get("key") or str(field.get("source") or "").split(".")[-1]
                label = field.get("label") or key
            else:
                key = str(field).split(".")[-1]
                label = key
            if key:
                fields.append({"name": key, "type": "string", "description": f"Final workflow output: {label}"})
        return fields

    def get_or_create_dashboard(
        self,
        workflow_id: str,
        workspace_id: str,
        user_id: str,
        source: WorkflowSource = "draft",
        version: int | None = None,
    ) -> DashboardRow:
        definition, meta, workflow_name = self._definition_and_meta(workflow_id, workspace_id, source, version)
        with self.db_session_factory() as session:
            for row in session.dashboards.list_by_workspace(workspace_id):
                if (
                    (row.get("dashboard_type") or "campaign") == "workflow"
                    and row.get("workflow_id") == workflow_id
                    and (row.get("workflow_source") or "draft") == meta["workflow_source"]
                    and (row.get("workflow_version") or None) == meta["workflow_version"]
                ):
                    return campaign_service._dashboard_row(row)

            dashboard_id = str(uuid.uuid4())
            schema = self._schema_from_outputs(definition)
            row = session.dashboards.create(
                dashboard_id,
                workspace_id,
                f"{workflow_name} Results",
                f"Workflow results dashboard for {workflow_name}.",
                "Workflow-backed dashboard. Final columns come from the workflow output node.",
                json.dumps(schema),
                model=None,
            )
            row = session.dashboards.update(
                dashboard_id,
                {
                    "dashboard_type": "workflow",
                    "workflow_id": workflow_id,
                    "workflow_source": meta["workflow_source"],
                    "workflow_version": meta["workflow_version"],
                    "workflow_revision": meta["workflow_revision"],
                    "workflow_definition_json": json.dumps(definition),
                },
            )
        return campaign_service._dashboard_row(row, schema)

    def _create_text_document(self, name: str, source_text: str, user_id: str, workspace_id: str, replace_existing: bool = False) -> str:
        filename = name.strip()
        if not filename:
            raise HTTPException(status_code=400, detail="Name is required for pasted-text workflow runs.")
        if not Path(filename).suffix:
            filename = f"{filename}.txt"
        existing = document_service.get_document_by_name(None, workspace_id, filename)
        if existing:
            if replace_existing:
                content = source_text.encode("utf-8")
                content_hash = ingestion_service.calculate_hash(content)
                document_service.update_document_metadata(
                    None,
                    str(existing.id),
                    len(content),
                    "text/plain",
                    content_hash,
                    status=DocumentStatus.completed,
                    metadata={**(existing.metadata or {}), "source": "workflow_pasted_text"},
                )
                storage_path = document_service.storage_service.upload_file(user_id, str(existing.id), filename, content, "text/plain")
                document_service.update_document_file_path(None, str(existing.id), storage_path)
                self._replace_document_text(str(existing.id), user_id, workspace_id, source_text)
            return str(existing.id)
        content = source_text.encode("utf-8")
        content_hash = ingestion_service.calculate_hash(content)
        doc = document_service.create_document(
            client=None,
            user_id=user_id,
            filename=filename,
            file_path="",
            file_size=len(content),
            content_type="text/plain",
            content_hash=content_hash,
            metadata={"source": "workflow_pasted_text"},
            workspace_id=workspace_id,
        )
        storage_path = document_service.storage_service.upload_file(user_id, str(doc.id), filename, content, "text/plain")
        document_service.update_document_file_path(None, str(doc.id), storage_path)
        self._replace_document_text(str(doc.id), user_id, workspace_id, source_text)
        with self.db_session_factory() as session:
            session.documents.update(str(doc.id), {"status": "completed"})
        return str(doc.id)

    def _replace_document_text(self, document_id: str, user_id: str, workspace_id: str, source_text: str) -> None:
        with self.db_session_factory() as session:
            session.chunks.delete_by_document(document_id)
            session.chunks.create_chunks([
                {
                    "id": str(uuid.uuid4()),
                    "document_id": document_id,
                    "user_id": user_id,
                    "workspace_id": workspace_id,
                    "content": source_text,
                    "embedding": None,
                    "metadata": json.dumps({"chunk_index": 0, "source": "workflow_dashboard"}),
                }
            ])

    def _document_text(self, document_id: str) -> str:
        from app.services.coding_service import coding_service

        text = coding_service.get_document_text(document_id)
        if text.strip():
            return text
        doc = document_service.get_document(None, document_id)
        if doc and doc.file_path:
            try:
                return document_service.storage_service.download_file(doc.file_path).decode("utf-8", errors="replace")
            except Exception:
                logger.exception("Could not read workflow source text for document_id=%s", document_id)
        raise HTTPException(status_code=400, detail="Document text content could not be retrieved.")

    async def _execute_document(self, dashboard_id: str, document_id: str, definition: dict[str, Any]) -> DashboardDocumentRow:
        with self.db_session_factory() as session:
            session.dashboard_documents.create_or_update(dashboard_id, document_id, "{}", "processing", current_step=1, total_steps=3)
        try:
            source_text = self._document_text(document_id)
            with self.db_session_factory() as session:
                session.dashboard_documents.update_progress(dashboard_id, document_id, 2, 3)
            result = await workflow_executor.execute(definition, source_text)
            with self.db_session_factory() as session:
                session.dashboard_documents.update_workflow_result(
                    dashboard_id,
                    document_id,
                    json.dumps(result["outputs"]),
                    json.dumps(result["trace"]),
                    json.dumps(result["context"]),
                    status="completed",
                )
                row = session.dashboard_documents.get_workflow_result(dashboard_id, document_id)
            return campaign_service._dashboard_document_row(row)
        except WorkflowExecutionError as exc:
            error_message = str(exc)
        except Exception as exc:
            logger.exception("Workflow dashboard execution failed for dashboard_id=%s document_id=%s", dashboard_id, document_id)
            error_message = str(exc)
        with self.db_session_factory() as session:
            session.dashboard_documents.update_workflow_result(
                dashboard_id,
                document_id,
                "{}",
                json.dumps([]),
                json.dumps({}),
                status="failed",
                error_message=error_message,
                error_type="API_FAILURE",
            )
            row = session.dashboard_documents.get_workflow_result(dashboard_id, document_id)
        return campaign_service._dashboard_document_row(row)

    async def run_text(
        self,
        workflow_id: str,
        workspace_id: str,
        user_id: str,
        name: str,
        source_text: str,
        source: WorkflowSource = "draft",
        version: int | None = None,
        rerun: bool = False,
    ) -> tuple[DashboardRow, DashboardDocumentRow]:
        dashboard = self.get_or_create_dashboard(workflow_id, workspace_id, user_id, source, version)
        doc_id = self._create_text_document(name, source_text, user_id, workspace_id, replace_existing=rerun)
        with self.db_session_factory() as session:
            existing = session.dashboard_documents.get(dashboard.id, doc_id)
            if existing and not rerun:
                raise HTTPException(status_code=409, detail={"message": "This name already exists in the workflow dashboard.", "dashboard_id": dashboard.id, "document_id": doc_id})
            session.dashboard_documents.create_or_update(dashboard.id, doc_id, "{}", "pending", current_step=0, total_steps=3)
            dash_row = session.dashboards.get_by_id(dashboard.id)
            definition = json.loads(dash_row["workflow_definition_json"])
        result_row = await self._execute_document(dashboard.id, doc_id, definition)
        return dashboard, result_row

    async def run_uploaded_files(
        self,
        workflow_id: str,
        workspace_id: str,
        user_id: str,
        files: list[UploadFile],
        source: WorkflowSource = "draft",
        version: int | None = None,
        rerun_filenames: set[str] | None = None,
    ) -> tuple[DashboardRow, list[DashboardDocumentRow], list[str]]:
        dashboard = self.get_or_create_dashboard(workflow_id, workspace_id, user_id, source, version)
        rerun_filenames = rerun_filenames or set()
        rows: list[DashboardDocumentRow] = []
        skipped: list[str] = []
        with self.db_session_factory() as session:
            dash_row = session.dashboards.get_by_id(dashboard.id)
            definition = json.loads(dash_row["workflow_definition_json"])
        for file in files:
            filename = file.filename or "workflow-upload.txt"
            ext = Path(filename).suffix.lower().lstrip(".")
            if ext not in ALLOWED_EXTENSIONS:
                skipped.append(filename)
                continue
            content = await file.read()
            if not content or len(content) > MAX_FILE_SIZE_BYTES:
                skipped.append(filename)
                continue
            text = extract_text(content, file.content_type or "text/plain", filename=filename)
            doc_id = self._create_text_document(filename, text, user_id, workspace_id, replace_existing=filename in rerun_filenames)
            with self.db_session_factory() as session:
                existing = session.dashboard_documents.get(dashboard.id, doc_id)
                if existing and filename not in rerun_filenames:
                    skipped.append(filename)
                    continue
                session.dashboard_documents.create_or_update(dashboard.id, doc_id, "{}", "pending", current_step=0, total_steps=3)
            rows.append(await self._execute_document(dashboard.id, doc_id, definition))
        return dashboard, rows, skipped

    async def run_existing_documents(
        self,
        workflow_id: str,
        workspace_id: str,
        user_id: str,
        document_ids: list[str],
        source: WorkflowSource = "draft",
        version: int | None = None,
        rerun_document_ids: set[str] | None = None,
    ) -> tuple[DashboardRow, list[DashboardDocumentRow], list[str]]:
        dashboard = self.get_or_create_dashboard(workflow_id, workspace_id, user_id, source, version)
        rerun_document_ids = rerun_document_ids or set()
        rows: list[DashboardDocumentRow] = []
        skipped: list[str] = []
        with self.db_session_factory() as session:
            dash_row = session.dashboards.get_by_id(dashboard.id)
            definition = json.loads(dash_row["workflow_definition_json"])
        for doc_id in document_ids:
            doc = document_service.get_document(None, doc_id)
            if not doc:
                skipped.append(doc_id)
                continue
            with self.db_session_factory() as session:
                existing = session.dashboard_documents.get(dashboard.id, doc_id)
                if existing and doc_id not in rerun_document_ids:
                    skipped.append(doc.filename)
                    continue
                session.dashboard_documents.create_or_update(dashboard.id, doc_id, "{}", "pending", current_step=0, total_steps=3)
            rows.append(await self._execute_document(dashboard.id, doc_id, definition))
        return dashboard, rows, skipped

    def get_trace(self, dashboard_id: str, document_id: str) -> DashboardDocumentRow:
        with self.db_session_factory() as session:
            row = session.dashboard_documents.get_workflow_result(dashboard_id, document_id)
        if not row:
            raise HTTPException(status_code=404, detail="Workflow result not found.")
        return campaign_service._dashboard_document_row(row)


workflow_dashboard_service = WorkflowDashboardService()
