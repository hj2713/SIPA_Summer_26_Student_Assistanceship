import logging
import json
from pathlib import Path
from typing import Any, Optional
from fastapi import HTTPException, UploadFile

from app.core.request_context import set_current_user_id
from app.repositories import get_db_session
from app.schemas.dashboard import DashboardRow, DashboardDocumentRow, WorkflowSource
from app.services.campaign_service import campaign_service
from app.services.document_service import document_service
from app.services.ingestion_service import extract_text
from app.workflows.executor import workflow_executor, WorkflowExecutionError

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {"pdf", "txt", "docx", "html", "htm"}
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50MB


class WorkflowDashboardService:
    """Orchestrates document executions on published workflows."""

    def __init__(self, db_session_factory=get_db_session):
        self.db_session_factory = db_session_factory

    def get_or_create_dashboard(
        self,
        workflow_id: str,
        workspace_id: str,
        user_id: str,
        source: WorkflowSource = "draft",
        version: int | None = None,
    ) -> DashboardRow:
        """Resolve a dashboard corresponding to a workflow's published version or draft."""
        with self.db_session_factory() as session:
            if source == "published":
                if version is None:
                    raise HTTPException(status_code=400, detail="Version is required for published workflows.")
                row = session.dashboards.get_for_workflow(workflow_id, "published", version)
            else:
                row = session.dashboards.get_for_workflow(workflow_id, "draft")

            if row:
                return campaign_service._dashboard_row(row)

            # Not found: create dashboard
            workflow = session.coding_workflows.get(workflow_id)
            if not workflow:
                raise HTTPException(status_code=404, detail="Workflow not found.")

            if source == "published":
                wf_version = session.coding_workflows.get_version(workflow_id, version)
                if not wf_version:
                    raise HTTPException(status_code=404, detail=f"Workflow version {version} not found.")
                definition = wf_version["definition"]
                wf_revision = wf_version["revision"]
                name = f"{workflow['name']} (v{version})"
            else:
                definition = workflow["definition"]
                wf_revision = workflow["revision"]
                name = f"{workflow['name']} (Draft)"

            # Map workflow definition schema to dashboard fields
            try:
                def_dict = json.loads(definition) if isinstance(definition, str) else (definition or {})
            except Exception:
                def_dict = {}

            nodes = def_dict.get("nodes") or []
            schema_fields = []
            seen = set()

            # Output fields declared in variables nodes
            for node in nodes:
                if node.get("kind") == "output":
                    config = node.get("config") or {}
                    for field in config.get("outputs") or []:
                        fname = field.get("key")
                        if fname and fname not in seen:
                            schema_fields.append({
                                "name": fname,
                                "type": field.get("type") or "string",
                                "description": field.get("label") or f"Workflow Output: {fname}",
                                "options": field.get("options") or None,
                                "prompt": "",
                                "depends_on": [],
                                "workflow_source": f"{node['id']}.{fname}",
                            })
                            seen.add(fname)

            # Create the dashboard row
            dash_payload = {
                "id": None,
                "workspace_id": workspace_id,
                "name": name,
                "description": workflow["description"] or f"Dashboard running workflow {workflow['name']}",
                "prompt": "Workflow execution",
                "schema": json.dumps(schema_fields),
                "model": workflow.get("model") or "gemini-3.1-flash-lite",
                "dashboard_type": "workflow",
                "workflow_id": workflow_id,
                "workflow_source": source,
                "workflow_version": version if source == "published" else None,
                "workflow_revision": wf_revision,
                "workflow_definition_json": json.dumps(def_dict),
            }
            new_id = session.dashboards.create(dash_payload)
            new_row = session.dashboards.get_by_id(new_id)
            return campaign_service._dashboard_row(new_row)

    def _create_text_document(
        self,
        filename: str,
        text: str,
        user_id: str,
        workspace_id: str,
        replace_existing: bool = False,
    ) -> str:
        """Create doc and ingest text."""
        with self.db_session_factory() as session:
            if replace_existing:
                existing = session.documents.get_by_filename(workspace_id, filename)
                if existing:
                    # Clear existing document chunks
                    session.chunks.delete_chunks_by_document(existing["id"])
                    # Re-ingest
                    document_service.ingest_document_text(existing["id"], text)
                    return existing["id"]

            doc_id = document_service.create_document(
                workspace_id=workspace_id,
                user_id=user_id,
                filename=filename,
                file_size=len(text),
                status="completed",
            )
            document_service.ingest_document_text(doc_id, text)
            return doc_id

    def _document_text(self, document_id: str) -> str:
        """Gather all document chunks into a consolidated string."""
        with self.db_session_factory() as session:
            chunks = session.chunks.get_chunks_by_document(document_id)
            if chunks:
                chunks_with_idx = []
                for ch in chunks:
                    meta = ch.get("metadata") or {}
                    if isinstance(meta, str):
                        try:
                            meta = json.loads(meta)
                        except Exception:
                            meta = {}
                    idx = meta.get("chunk_index", 0) if isinstance(meta, dict) else 0
                    chunks_with_idx.append((idx, ch.get("content", "")))
                chunks_with_idx.sort(key=lambda x: x[0])
                return "\n\n".join(c[1] for c in chunks_with_idx)

            # Fallback to local raw text if chunks aren't written yet
            doc = session.documents.get(document_id)
            if doc and doc.get("status") == "completed":
                # Check file content
                logger.warning("No chunks found in DB for completed document_id=%s. Attempting raw text lookup.", document_id)
                # If you have a local filepath store, read from it here.
            else:
                logger.exception("Could not read workflow source text for document_id=%s", document_id)
        raise HTTPException(status_code=400, detail="Document text content could not be retrieved.")

    async def _execute_document(self, dashboard_id: str, document_id: str, definition: dict[str, Any], retry_model: Optional[str] = None) -> DashboardDocumentRow:
        with self.db_session_factory() as session:
            session.dashboard_documents.create_or_update(dashboard_id, document_id, "{}", "processing", current_step=1, total_steps=3)
        try:
            source_text = self._document_text(document_id)
            with self.db_session_factory() as session:
                session.dashboard_documents.update_progress(dashboard_id, document_id, 2, 3)

            # Resolve models from dashboard
            with self.db_session_factory() as session:
                dash_row = session.dashboards.get_by_id(dashboard_id)
                schema_json = dash_row.get("schema") if dash_row else "[]"
                schema_fields = json.loads(schema_json) if isinstance(schema_json, str) else (schema_json or [])
                model_name = dash_row.get("model") or "gemini-3.1-flash-lite"
                dashboard_type = dash_row.get("dashboard_type") or "campaign"
                token_limit = dash_row.get("token_limit") or 2500000

            if "," in model_name or dashboard_type == "model_comparison":
                models = [m.strip() for m in model_name.split(",") if m.strip()]
                is_multi_model = True
            else:
                models = [model_name]
                is_multi_model = False

            if is_multi_model:
                # Multi-model logic for Workflow runs
                with self.db_session_factory() as session:
                    doc_dd = session.dashboard_documents.get(dashboard_id, document_id)
                    existing_coded_str = doc_dd.get("coded_values") if doc_dd else "{}"
                    try:
                        coded_values = json.loads(existing_coded_str) if existing_coded_str else {}
                    except Exception:
                        coded_values = {}

                suspended_any = False
                failed_any = False
                completed_all = True

                for current_model in models:
                    model_data = coded_values.get(current_model) or {}
                    model_status = model_data.get("status") or "pending"

                    if model_status == "completed" and (not retry_model or retry_model != current_model):
                        continue

                    # Check token safety limit
                    token_sum = 0
                    with self.db_session_factory() as session:
                        stats = session.usage_logs.get_usage_stats(timeframe="all", campaign_id=dashboard_id)
                        for item in stats.get("breakdown") or []:
                            if item.get("model") == current_model:
                                token_sum = item.get("input_tokens", 0) + item.get("output_tokens", 0)

                    if token_sum >= token_limit:
                        logger.warning("Token safety limit %d exceeded for model %s (sum=%d)", token_limit, current_model, token_sum)
                        coded_values[current_model] = {
                            "values": model_data.get("values") or {},
                            "status": "suspended_limit",
                            "error_message": f"Token limit of {token_limit} exceeded.",
                            "error_type": "API_FAILURE"
                        }
                        suspended_any = True
                        completed_all = False
                        continue

                    try:
                        usage_list = []
                        ctx = {
                            "service": "workflow_coding",
                            "campaign_id": str(dashboard_id),
                            "usage_accumulator": usage_list
                        }
                        result = await workflow_executor.execute(
                            definition, 
                            source_text, 
                            model_name=current_model,
                            log_context=ctx
                        )
                        model_coded = dict(result["outputs"])
                        model_context = result.get("context", {})

                        # Match intermediate LLM node outputs representing reasoning
                        for col in schema_fields:
                            col_name = col.get("name")
                            if not col_name:
                                continue
                            workflow_source = col.get("workflow_source")
                            
                            reasoning = None
                            if workflow_source:
                                parts = str(workflow_source).split(".")
                                node_id = parts[0]
                                field_name = parts[1] if len(parts) > 1 else node_id
                                
                                candidates = [
                                    f"{node_id}.{field_name}_reasoning",
                                    f"{node_id}.{field_name}_rationale",
                                    f"{node_id}.{field_name}_explanation",
                                    f"{node_id}.{col_name}_reasoning",
                                    f"{node_id}.{col_name}_rationale",
                                    f"{node_id}.{col_name}_explanation",
                                    f"{node_id}.reasoning",
                                    f"{node_id}.rationale",
                                    f"{node_id}.explanation",
                                    f"{field_name}_reasoning",
                                    f"{field_name}_rationale",
                                    f"{col_name}_reasoning",
                                    f"{col_name}_rationale",
                                ]
                                for candidate in candidates:
                                    if candidate in model_context and model_context[candidate]:
                                        reasoning = str(model_context[candidate])
                                        break
                                
                                if not reasoning:
                                    node_prefix = f"{node_id}."
                                    node_keys = [k for k in model_context.keys() if k.startswith(node_prefix)]
                                    reasoning_keys = []
                                    for k in node_keys:
                                        suffix = k[len(node_prefix):].lower()
                                        if "reason" in suffix or "rationale" in suffix or "explain" in suffix:
                                            reasoning_keys.append(k)
                                    if len(reasoning_keys) == 1:
                                        reasoning = str(model_context[reasoning_keys[0]])
                                    elif len(reasoning_keys) > 1:
                                        for k in reasoning_keys:
                                            suffix = k[len(node_prefix):].lower()
                                            if field_name.lower() in suffix or col_name.lower() in suffix:
                                                reasoning = str(model_context[k])
                                                break
                                        if not reasoning:
                                            reasoning = str(model_context[reasoning_keys[0]])
                            
                            if reasoning is not None:
                                model_coded[f"{col_name}_reasoning"] = reasoning

                            # Initialize history for audit logs
                            import datetime
                            val = model_coded.get(col_name)
                            model_coded[f"{col_name}_history"] = [
                                {
                                    "version": 1,
                                    "value": val,
                                    "reasoning": reasoning,
                                    "feedback_prompt": None,
                                    "timestamp": datetime.datetime.now(datetime.UTC).isoformat() + "Z",
                                    "source": "ai"
                                }
                            ]

                        # Compute tokens and cost
                        input_tokens = sum(u.input_tokens for u in usage_list if u)
                        output_tokens = sum(u.output_tokens for u in usage_list if u)
                        from app.llm.registry import calculate_cost
                        cost = calculate_cost(current_model, input_tokens, output_tokens)

                        coded_values[current_model] = {
                            "values": model_coded,
                            "status": "completed",
                            "error_message": None,
                            "error_type": None,
                            "trace": result["trace"],
                            "context": result["context"],
                            "input_tokens": input_tokens,
                            "output_tokens": output_tokens,
                            "cost": cost
                        }

                    except Exception as model_err:
                        logger.error("Workflow failed for model %s on doc %s: %s", current_model, document_id, model_err)
                        coded_values[current_model] = {
                            "values": {},
                            "status": "failed",
                            "error_message": str(model_err),
                            "error_type": "API_FAILURE"
                        }
                        failed_any = True
                        completed_all = False

                # Determine overall document status
                if completed_all:
                    overall_status = "completed"
                    overall_error = None
                    overall_err_type = None
                elif suspended_any:
                    overall_status = "failed"
                    overall_error = f"Token limit exceeded for some models. Please authorize raise."
                    overall_err_type = "API_FAILURE"
                else:
                    overall_status = "failed"
                    overall_error = "One or more LLM models failed."
                    overall_err_type = "API_FAILURE"

                # Save nested coded values to DB
                # For backward-compatibility we can save last model's trace and context at the top level
                last_model = models[-1]
                last_trace = coded_values.get(last_model, {}).get("trace") or []
                last_context = coded_values.get(last_model, {}).get("context") or {}

                with self.db_session_factory() as session:
                    session.dashboard_documents.update_workflow_result(
                        dashboard_id,
                        document_id,
                        json.dumps(coded_values),
                        json.dumps(last_trace),
                        json.dumps(last_context),
                        status=overall_status,
                    )
                    if overall_error:
                        session.dashboard_documents.update_error(
                            dashboard_id=dashboard_id,
                            document_id=document_id,
                            error_message=overall_error,
                            error_type=overall_err_type
                        )
                with self.db_session_factory() as session:
                    row = session.dashboard_documents.get_workflow_result(dashboard_id, document_id)
                return campaign_service._dashboard_document_row(row)

            else:
                # Single-model (standard) workflow run
                result = await workflow_executor.execute(definition, source_text)
                coded_values = dict(result["outputs"])
                context = result.get("context", {})
                import datetime

                for col in schema_fields:
                    col_name = col.get("name")
                    if not col_name:
                        continue
                    workflow_source = col.get("workflow_source")
                    
                    reasoning = None
                    if workflow_source:
                        parts = str(workflow_source).split(".")
                        node_id = parts[0]
                        field_name = parts[1] if len(parts) > 1 else node_id
                        
                        candidates = [
                            f"{node_id}.{field_name}_reasoning",
                            f"{node_id}.{field_name}_rationale",
                            f"{node_id}.{field_name}_explanation",
                            f"{node_id}.{col_name}_reasoning",
                            f"{node_id}.{col_name}_rationale",
                            f"{node_id}.{col_name}_explanation",
                            f"{node_id}.reasoning",
                            f"{node_id}.rationale",
                            f"{node_id}.explanation",
                            f"{field_name}_reasoning",
                            f"{field_name}_rationale",
                            f"{col_name}_reasoning",
                            f"{col_name}_rationale",
                        ]
                        for candidate in candidates:
                            if candidate in context and context[candidate]:
                                reasoning = str(context[candidate])
                                break
                        
                        if not reasoning:
                            node_prefix = f"{node_id}."
                            node_keys = [k for k in context.keys() if k.startswith(node_prefix)]
                            reasoning_keys = []
                            for k in node_keys:
                                suffix = k[len(node_prefix):].lower()
                                if "reason" in suffix or "rationale" in suffix or "explain" in suffix:
                                    reasoning_keys.append(k)
                            if len(reasoning_keys) == 1:
                                reasoning = str(context[reasoning_keys[0]])
                            elif len(reasoning_keys) > 1:
                                for k in reasoning_keys:
                                    suffix = k[len(node_prefix):].lower()
                                    if field_name.lower() in suffix or col_name.lower() in suffix:
                                        reasoning = str(context[k])
                                        break
                                if not reasoning:
                                    reasoning = str(context[reasoning_keys[0]])
                    
                    if reasoning is not None:
                        coded_values[f"{col_name}_reasoning"] = reasoning
                    
                    val = coded_values.get(col_name)
                    coded_values[f"{col_name}_history"] = [
                        {
                            "version": 1,
                            "value": val,
                            "reasoning": reasoning,
                            "feedback_prompt": None,
                            "timestamp": datetime.datetime.now(datetime.UTC).isoformat() + "Z",
                            "source": "ai"
                        }
                    ]

                with self.db_session_factory() as session:
                    session.dashboard_documents.update_workflow_result(
                        dashboard_id,
                        document_id,
                        json.dumps(coded_values),
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

        row = await self._execute_document(dashboard.id, doc_id, definition)
        return dashboard, row

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
        
        pending_doc_ids = []
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
                pending_doc_ids.append(doc_id)
                
                row = session.dashboard_documents.get_workflow_result(dashboard.id, doc_id)
                if row:
                    rows.append(campaign_service._dashboard_document_row(row))

        if pending_doc_ids:
            async def _exec_task():
                for doc_id in pending_doc_ids:
                    try:
                        await self._execute_document(dashboard.id, doc_id, definition)
                    except Exception:
                        logger.exception("Background execution failed for uploaded file document %s", doc_id)

            from app.services.coding_service import coding_service
            coding_service.schedule_coroutine(_exec_task())

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
        retry_model: str | None = None,
    ) -> tuple[DashboardRow, list[DashboardDocumentRow], list[str]]:
        dashboard = self.get_or_create_dashboard(workflow_id, workspace_id, user_id, source, version)
        rerun_document_ids = rerun_document_ids or set()
        rows: list[DashboardDocumentRow] = []
        skipped: list[str] = []
        with self.db_session_factory() as session:
            dash_row = session.dashboards.get_by_id(dashboard.id)
            definition = json.loads(dash_row["workflow_definition_json"])
        
        pending_doc_ids = []
        for doc_id in document_ids:
            doc = document_service.get_document(None, doc_id)
            if not doc:
                skipped.append(doc_id)
                continue
            with self.db_session_factory() as session:
                existing = session.dashboard_documents.get(dashboard.id, doc_id)
                if existing and doc_id not in rerun_document_ids and not retry_model:
                    skipped.append(doc.filename)
                    continue
                session.dashboard_documents.create_or_update(dashboard.id, doc_id, "{}", "pending", current_step=0, total_steps=3)
                pending_doc_ids.append(doc_id)
                
                row = session.dashboard_documents.get_workflow_result(dashboard.id, doc_id)
                if row:
                    rows.append(campaign_service._dashboard_document_row(row))

        if pending_doc_ids:
            async def _exec_task():
                for doc_id in pending_doc_ids:
                    try:
                        await self._execute_document(dashboard.id, doc_id, definition, retry_model)
                    except Exception:
                        logger.exception("Background execution failed for existing document %s", doc_id)

            from app.services.coding_service import coding_service
            coding_service.schedule_coroutine(_exec_task())

        return dashboard, rows, skipped

    def get_trace(self, dashboard_id: str, document_id: str) -> DashboardDocumentRow:
        with self.db_session_factory() as session:
            row = session.dashboard_documents.get_workflow_result(dashboard_id, document_id)
        if not row:
            raise HTTPException(status_code=404, detail="Workflow result not found.")
        return campaign_service._dashboard_document_row(row)


workflow_dashboard_service = WorkflowDashboardService()
